#!/usr/bin/env bash
set -euo pipefail

pnpm test
pnpm web:build

mapfile -t migrations < <(find apps/api/src/db/migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort)
if [[ "${#migrations[@]}" -eq 0 ]]; then
  echo 'No migrations found.' >&2
  exit 1
fi
for migration in "${migrations[@]}"; do
  if ! grep -Eq 'CREATE TABLE IF NOT EXISTS|ALTER TABLE' "apps/api/src/db/migrations/$migration"; then
    echo "Migration $migration does not contain retry-safe DDL." >&2
    exit 1
  fi
done

required_files=(
  docs/GUIA_ABSOLUTA_PRODUCTO_FINAL.md
  apps/api/src/services/policy-service.js
  apps/api/src/services/biometric-monitor-service.js
  apps/api/src/services/risk-score-service.js
  apps/web/lib/biometric-monitor.js
  apps/web/lib/device-signals.js
)
for required_file in "${required_files[@]}"; do
  [[ -f "$required_file" ]] || { echo "Required file is missing: $required_file" >&2; exit 1; }
done

hashes=$(find . -type f -name 'GUIA_ABSOLUTA_PRODUCTO_FINAL.md' -print0 | xargs -0 sha256sum | awk '{print $1}' | sort -u)
[[ "$(wc -l <<< "$hashes")" -eq 1 ]] || { echo 'Absolute guide copies do not have identical hashes.' >&2; exit 1; }

pnpm api:infra:check
