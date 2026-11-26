#!/usr/bin/env bash
# Server-side deployment for the Lead-Gen staging instance.
# Called by GitHub Actions over SSH after the workflow checks have passed.
#
# Required runtime configuration:
#   PM2_APP=lead-gen-staging
#   APP_PORT=3011
#   PREV_SHA=<commit running before this deployment>

set -euo pipefail

# Run from a temporary copy because rollback may reset this repository.
if [[ -z "${DEPLOY_REEXEC:-}" ]]; then
  PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  TMP_COPY="$(mktemp /tmp/lead-gen-deploy-XXXXXX.sh)"
  cp "$0" "$TMP_COPY"
  export DEPLOY_REEXEC=1 PROJECT_ROOT
  exec bash "$TMP_COPY" "$@"
fi

BACKUP_DIR=""
cleanup() {
  rm -f "$0"
  if [[ -n "$BACKUP_DIR" ]]; then
    rm -rf "$BACKUP_DIR"
  fi
}
trap cleanup EXIT

cd "$PROJECT_ROOT"

APP="${PM2_APP:-lead-gen-staging}"
PORT="${APP_PORT:-3011}"
PREV="${PREV_SHA:-}"
NEW="$(git rev-parse --short HEAD)"

log() {
  echo "[lead-gen deploy $(date +%H:%M:%S)] $*"
}

# Prevent overlapping deployment runs for this PM2 process.
exec 9>"/tmp/${APP}-deploy.lock"
if ! flock -n 9; then
  log "Another deployment is already running for $APP. Aborting."
  exit 1
fi

start_app() {
  if [[ ! -f ecosystem.config.cjs ]]; then
    log "ecosystem.config.cjs is missing."
    return 1
  fi
  pm2 startOrReload ecosystem.config.cjs --only "$APP" --update-env 9>&-
}

healthy() {
  local i body
  for i in $(seq 1 30); do
    body="$(curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || true)"
    if printf '%s' "$body" | grep -q '"status"[[:space:]]*:[[:space:]]*"healthy"'; then
      return 0
    fi
    sleep 2
  done
  return 1
}

restore_build_artifacts() {
  if [[ -d "$BACKUP_DIR/dist" ]]; then
    rm -rf dist
    cp -a "$BACKUP_DIR/dist" dist
  fi
  for artifact in core-server.bundle.js _seo-page.bundle.js; do
    if [[ -f "$BACKUP_DIR/api/$artifact" ]]; then
      mkdir -p api
      cp -a "$BACKUP_DIR/api/$artifact" "api/$artifact"
    fi
  done
}

rollback() {
  local failed_status=$?
  set +e
  log "Deployment failed (exit $failed_status). Rolling back to ${PREV:-previous available build}."

  if [[ -n "$PREV" ]]; then
    git reset --hard "$PREV"
    npm ci --no-audit --no-fund
    if ! npm run build; then
      log "Previous commit rebuild failed; restoring saved build artifacts."
      restore_build_artifacts
    fi
  else
    restore_build_artifacts
  fi

  start_app
  if healthy; then
    log "Rollback completed; the previous staging version is healthy."
  else
    log "WARNING: rollback could not confirm health. Inspect: pm2 logs $APP"
  fi
  exit 1
}

log "Deploying $NEW (previous: ${PREV:0:7})"

BACKUP_DIR="$(mktemp -d "/tmp/${APP}-backup.XXXXXX")"
if [[ -d dist ]]; then
  cp -a dist "$BACKUP_DIR/dist"
fi
for artifact in core-server.bundle.js _seo-page.bundle.js; do
  if [[ -f "api/$artifact" ]]; then
    mkdir -p "$BACKUP_DIR/api"
    cp -a "api/$artifact" "$BACKUP_DIR/api/$artifact"
  fi
done

log "Installing dependencies"
npm ci --no-audit --no-fund || rollback

log "Building application"
npm run build || rollback

mkdir -p logs

log "Starting/reloading PM2 process: $APP"
start_app || rollback

log "Checking local health endpoint on port $PORT"
healthy || rollback

pm2 save >/dev/null 2>&1 9>&- || true
log "Deployment $NEW completed successfully."
