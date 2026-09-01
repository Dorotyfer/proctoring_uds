#!/usr/bin/env bash
set -euo pipefail

release_commit="${1:?Usage: deploy-blue-green.sh <commit> <blue|green> [api|web|all]}"
target="${2:?Usage: deploy-blue-green.sh <commit> <blue|green> [api|web|all]}"
service_scope="${3:-all}"
release_dir="/opt/proctoring/releases/$release_commit"

[[ "$target" == "blue" || "$target" == "green" ]] || { echo 'Target must be blue or green.' >&2; exit 1; }
[[ "$service_scope" == "api" || "$service_scope" == "web" || "$service_scope" == "all" ]] || { echo 'Scope must be api, web or all.' >&2; exit 1; }
[[ ! -e "$release_dir" ]] || { echo "Release already exists: $release_dir" >&2; exit 1; }

git clone --no-checkout /opt/proctoring/repository "$release_dir"
git -C "$release_dir" checkout --detach "$release_commit"
cd "$release_dir"
/usr/bin/pnpm install --frozen-lockfile
/usr/bin/pnpm --filter @proctoring/api migrate
/usr/bin/pnpm test
/usr/bin/pnpm web:build

if [[ "$service_scope" == "api" || "$service_scope" == "all" ]]; then
  systemctl restart "proctoring-api@$target.service"
  api_port=$(awk -F= '/^PROCTORING_PORT=/{print $2}' "/etc/proctoring/api-$target.env")
  curl --fail --silent --show-error "http://127.0.0.1:$api_port/health" >/dev/null
fi
if [[ "$service_scope" == "web" || "$service_scope" == "all" ]]; then
  systemctl restart "proctoring-web@$target.service"
fi

nginx -t
systemctl reload nginx
echo "Release $release_commit is ready on $target. Execute the synthetic Moodle/API/evidence smoke test before changing the active upstream."
