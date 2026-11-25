# MongoDB Atlas database migration: amaavigo-leadGen -> leadGen-main
# Uses the temporary users:
#   Source: leadgen_migrator_read
#   Target: leadgen_migrator_write
# Passwords are requested interactively by mongodump/mongorestore.
# This script never uses --drop and does not modify the source cluster.

$ErrorActionPreference = "Stop"

$Database = "amaavigo-leadGen"
$SourceHost = "mongodb+srv://amaavigo-leadgen.o87jyef.mongodb.net/"
$TargetHost = "mongodb+srv://leadgen-main.c55jd7u.mongodb.net/"
$SourceUser = "leadgen_migrator_read"
$TargetUser = "leadgen_migrator_write"

function Find-DatabaseTool([string]$Name) {
    $cmd = Get-Command "$Name.exe" -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $defaultPath = Join-Path $env:USERPROFILE "Downloads\mongodb-database-tools-windows-x86_64-100.20.1\bin\$Name.exe"
    if (Test-Path $defaultPath) { return $defaultPath }

    throw "$Name.exe not found. Add the MongoDB Database Tools bin folder to PATH, or install the tools."
}

try {
    $MongoDump = Find-DatabaseTool "mongodump"
    $MongoRestore = Find-DatabaseTool "mongorestore"

    Write-Host ""
    Write-Host "SOURCE: old Atlas cluster amaavigo-leadGen" -ForegroundColor Cyan
    Write-Host "TARGET: new Atlas cluster leadGen-main" -ForegroundColor Cyan
    Write-Host "DATABASE: $Database"
    Write-Host ""
    Write-Host "Before continuing:" -ForegroundColor Yellow
    Write-Host "  1. Pause app/worker writes to the OLD database for the backup and restore window."
    Write-Host "  2. Confirm the NEW destination database is empty (no existing app data)."
    Write-Host "  3. Confirm both temporary users exist and the Atlas IP access rules permit your connection."
    Write-Host ""
    $ready = Read-Host 'Type READY only when all three checks are complete'
    if ($ready -cne "READY") {
        throw "Cancelled. No database operation was run."
    }

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $Archive = Join-Path $PSScriptRoot "$Database-$timestamp.archive.gz"

    Write-Host ""
    Write-Host "STEP 1/2: Backing up the OLD database to:" -ForegroundColor Cyan
    Write-Host $Archive
    Write-Host "When prompted, enter the password for source user: $SourceUser"
    $dumpArgs = @(
        "--uri=$SourceHost",
        "--username=$SourceUser",
        "--authenticationDatabase=admin",
        "--db=$Database",
        "--archive=$Archive",
        "--gzip"
    )
    & $MongoDump @dumpArgs
    if ($LASTEXITCODE -ne 0) {
        throw "mongodump failed with exit code $LASTEXITCODE. The restore was not started."
    }
    if (-not (Test-Path $Archive) -or (Get-Item $Archive).Length -le 0) {
        throw "Backup archive was not created or is empty. The restore was not started."
    }

    Write-Host ""
    Write-Host "Backup created successfully: $([math]::Round((Get-Item $Archive).Length / 1MB, 2)) MB" -ForegroundColor Green
    Write-Host ""
    Write-Host "STEP 2/2: Restoring into the NEW database." -ForegroundColor Cyan
    Write-Host "When prompted, enter the password for target user: $TargetUser"
    Write-Host "No existing destination collections will be dropped."
    $restoreArgs = @(
        "--uri=$TargetHost",
        "--username=$TargetUser",
        "--authenticationDatabase=admin",
        "--archive=$Archive",
        "--gzip",
        "--stopOnError"
    )
    & $MongoRestore @restoreArgs
    if ($LASTEXITCODE -ne 0) {
        throw "mongorestore failed with exit code $LASTEXITCODE. The backup archive has been retained at: $Archive"
    }

    Write-Host ""
    Write-Host "MIGRATION COMMANDS COMPLETED." -ForegroundColor Green
    Write-Host "Backup retained at: $Archive"
    Write-Host "Do not change Vercel MONGODB_URI yet. Verify collection/document counts on the new cluster first."
}
catch {
    Write-Host ""
    Write-Host "MIGRATION STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
