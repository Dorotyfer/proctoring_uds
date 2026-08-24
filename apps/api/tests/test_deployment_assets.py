from pathlib import Path


ROOT = Path(__file__).parents[3]


def test_apache_excludes_browser_bearer_paths_from_access_log() -> None:
  config = (ROOT / "deploy/apache/proctoring.conf").read_text(encoding="utf-8")

  assert "SetEnvIf Request_URI" in config
  assert "proctoring_sensitive_path" in config
  assert "env=!proctoring_sensitive_path" in config
  assert "a2enmod proxy proxy_http headers setenvif" in (
    ROOT / "scripts/install-ubuntu.sh"
  ).read_text(encoding="utf-8")


def test_session_bootstrap_removes_browser_bearer_from_visible_history() -> None:
  script = (
    ROOT / "apps/api/src/proctoring/web/static/js/session-bootstrap.js"
  ).read_text(encoding="utf-8")

  assert "history.replaceState" in script
  assert "sanitizedSessionPath" in script


def test_installer_requires_offline_hash_locked_python_artifacts() -> None:
  installer = (ROOT / "scripts/install-ubuntu.sh").read_text(encoding="utf-8")

  assert "--wheelhouse" in installer
  assert "--requirements-lock" in installer
  assert "--no-index" in installer
  assert "--require-hashes" in installer
  assert "--no-build-isolation" in installer
