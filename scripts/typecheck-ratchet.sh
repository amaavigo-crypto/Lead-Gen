#!/usr/bin/env bash
# Allow the existing TypeScript error baseline, but prevent new errors from entering staging.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASELINE_FILE="$ROOT/.typecheck-baseline"
if [[ ! -f "$BASELINE_FILE" ]]; then
  echo "ERROR: .typecheck-baseline is missing."
  exit 1
fi

BASELINE="$(tr -d '[:space:]' < "$BASELINE_FILE")"
if [[ ! "$BASELINE" =~ ^[0-9]+$ ]]; then
  echo "ERROR: .typecheck-baseline must contain one non-negative integer."
  exit 1
fi

OUTPUT="$(mktemp)"
trap 'rm -f "$OUTPUT"' EXIT

set +e
npx tsc --noEmit --pretty false >"$OUTPUT" 2>&1
TSC_STATUS=$?
set -e

cat "$OUTPUT"

ERRORS="$(grep -cE 'error TS[0-9]+:' "$OUTPUT" || true)"
ERRORS="${ERRORS:-0}"

if [[ "$TSC_STATUS" -ne 0 && "$ERRORS" -eq 0 ]]; then
  echo "ERROR: TypeScript exited with status $TSC_STATUS but no standard TS diagnostics were found."
  exit "$TSC_STATUS"
fi

echo "TypeScript errors: $ERRORS (allowed baseline: $BASELINE)"

if (( ERRORS > BASELINE )); then
  echo "FAILED: TypeScript errors increased above the approved baseline."
  exit 1
fi

if (( ERRORS < BASELINE )); then
  echo "IMPROVED: Error count is below baseline. Lower .typecheck-baseline when the reduction is reviewed."
else
  echo "PASSED: No new TypeScript errors."
fi
