#!/usr/bin/env bash
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run as root" >&2; exit 1; }
target="${1:-/opt/proctoring/previous}"
resolved="$(readlink -f "$target")"
case "$resolved" in
  /opt/proctoring/releases/*) ;;
  *) echo "Rollback target must be a release under /opt/proctoring/releases" >&2; exit 1 ;;
esac
[[ -x "$resolved/venv/bin/proctoring-api" ]] || { echo "Rollback release is incomplete" >&2; exit 1; }

runuser -u proctoring -- "$resolved/venv/bin/proctoring-models" verify \
  --manifest /etc/proctoring/model-weights.json

current="$(readlink -f /opt/proctoring/current)"
ln -s "$resolved" /opt/proctoring/current.next
mv -Tf /opt/proctoring/current.next /opt/proctoring/current
ln -s "$current" /opt/proctoring/previous.next
mv -Tf /opt/proctoring/previous.next /opt/proctoring/previous

systemctl restart proctoring-api.service proctoring-worker.service
echo "Rolled back application code to $resolved; additive database migrations were retained"
