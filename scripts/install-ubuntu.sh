#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --source PATH --env FILE --manifest FILE --models-source PATH --wheelhouse PATH --requirements-lock FILE" >&2
  exit 2
}

source_path=""
env_file=""
manifest_file=""
models_source=""
wheelhouse=""
requirements_lock=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) source_path="${2:-}"; shift 2 ;;
    --env) env_file="${2:-}"; shift 2 ;;
    --manifest) manifest_file="${2:-}"; shift 2 ;;
    --models-source) models_source="${2:-}"; shift 2 ;;
    --wheelhouse) wheelhouse="${2:-}"; shift 2 ;;
    --requirements-lock) requirements_lock="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "Run as root" >&2; exit 1; }
[[ -d "$source_path/apps/api" && -d "$source_path/deploy/systemd" ]] || usage
[[ -f "$env_file" && -f "$manifest_file" && -d "$models_source" ]] || usage
[[ -d "$wheelhouse" && -f "$requirements_lock" ]] || usage
if grep -Eq '(^|[[:space:]])(--index-url|--extra-index-url|--find-links|--editable|-e)([[:space:]]|$)|://' "$requirements_lock"; then
  echo "Requirements lock must contain only offline hash-pinned package entries" >&2
  exit 1
fi
grep -qx 'INFERENCE_REQUESTED=true' "$env_file" || {
  echo "INFERENCE_REQUESTED=true is required; capture remains disabled" >&2
  exit 1
}
grep -qx 'API_HOST=127.0.0.1' "$env_file" || {
  echo "API_HOST must be 127.0.0.1 behind Apache" >&2
  exit 1
}
grep -qx 'MODEL_MANIFEST_PATH=/etc/proctoring/model-weights.json' "$env_file" || {
  echo "MODEL_MANIFEST_PATH must be /etc/proctoring/model-weights.json" >&2
  exit 1
}

id -u proctoring >/dev/null 2>&1 || useradd --system --home /var/lib/proctoring --shell /usr/sbin/nologin proctoring
install -d -o root -g proctoring -m 0750 /etc/proctoring /opt/proctoring /opt/proctoring/releases
install -d -o proctoring -g proctoring -m 0750 /var/lib/proctoring /opt/proctoring/.deepface/weights
install -o root -g proctoring -m 0640 "$env_file" /etc/proctoring/proctoring.env
install -o root -g proctoring -m 0640 "$manifest_file" /etc/proctoring/model-weights.json

release_id="$(date -u +%Y%m%d%H%M%S)-$(git -C "$source_path" rev-parse --short HEAD 2>/dev/null || echo source)"
release_path="/opt/proctoring/releases/$release_id"
install -d -o root -g proctoring -m 0750 "$release_path"
cp -a "$source_path/apps" "$source_path/deploy" "$release_path/"
python3.12 -m venv "$release_path/venv"
install -o root -g root -m 0644 "$requirements_lock" "$release_path/requirements-ubuntu-py312.lock"
"$release_path/venv/bin/pip" install --disable-pip-version-check \
  --no-index --find-links "$wheelhouse" --require-hashes \
  -r "$release_path/requirements-ubuntu-py312.lock"
"$release_path/venv/bin/pip" install --disable-pip-version-check \
  --no-index --find-links "$wheelhouse" --no-deps --no-build-isolation \
  "$release_path/apps/api"

manifest_weights_directory="$(python3.12 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["weightsDirectory"])' /etc/proctoring/model-weights.json)"
[[ "$manifest_weights_directory" == "/opt/proctoring/.deepface/weights" ]] || {
  echo "Manifest weightsDirectory must be /opt/proctoring/.deepface/weights" >&2
  exit 1
}

runuser -u proctoring -- "$release_path/venv/bin/proctoring-models" install-from-local \
  --manifest /etc/proctoring/model-weights.json --source "$models_source"
runuser -u proctoring -- "$release_path/venv/bin/proctoring-models" verify \
  --manifest /etc/proctoring/model-weights.json

run_configured() {
  runuser -u proctoring -- bash -c \
    'set -a; source /etc/proctoring/proctoring.env; set +a; exec "$@"' \
    proctoring-env "$@"
}
run_configured "$release_path/venv/bin/proctoring-migrate"
run_configured "$release_path/venv/bin/proctoring-check-infra"

install -o root -g root -m 0644 "$release_path"/deploy/systemd/* /etc/systemd/system/
install -o root -g root -m 0644 "$release_path/deploy/apache/proctoring.conf" /etc/apache2/sites-available/proctoring.conf
a2enmod proxy proxy_http headers setenvif
a2ensite proctoring.conf
apache2ctl configtest

previous_target=""
if [[ -L /opt/proctoring/current ]]; then
  previous_target="$(readlink -f /opt/proctoring/current)"
fi
switched=0
rollback_failed_install() {
  if [[ "$switched" -eq 1 && -n "$previous_target" ]]; then
    ln -s "$previous_target" /opt/proctoring/current.rollback
    mv -Tf /opt/proctoring/current.rollback /opt/proctoring/current
    systemctl daemon-reload || true
    systemctl restart proctoring-api.service proctoring-worker.service || true
  fi
}
trap rollback_failed_install ERR
ln -s "$release_path" /opt/proctoring/current.next
mv -Tf /opt/proctoring/current.next /opt/proctoring/current
switched=1
if [[ -n "$previous_target" ]]; then
  ln -s "$previous_target" /opt/proctoring/previous.next
  mv -Tf /opt/proctoring/previous.next /opt/proctoring/previous
fi

systemctl daemon-reload
systemctl enable --now proctoring-api.service proctoring-worker.service
systemctl enable --now proctoring-purge.timer proctoring-purge-staging.timer proctoring-check-infra.timer
systemctl reload apache2
trap - ERR

echo "Installed release $release_id"
