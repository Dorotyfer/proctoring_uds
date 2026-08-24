import base64
import hashlib
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from proctoring.config import Settings


def valid_environment() -> dict[str, str]:
  return {
    "API_PUBLIC_URL": "https://api.proctoring.example.edu/api/",
    "BIOMETRIC_ENCRYPTION_KEY": base64.b64encode(bytes(32)).decode(),
    "DATABASE_URL": "mysql://service:password@127.0.0.1:3306/proctoring",
    "EVIDENCE_ENCRYPTION_KEY": base64.b64encode(bytes([1]) * 32).decode(),
    "JWT_SECRET": "browser-token-secret-with-32-characters",
    "MOODLE_INTEGRATION_KEY": "moodle-integration-key-with-32-characters",
    "PANEL_SSO_SECRET": "panel-sso-secret-with-at-least-32-characters",
    "S3_ACCESS_KEY_ID": "access-key",
    "S3_BUCKET": "evidence",
    "S3_ENDPOINT": "https://s3.example.edu",
    "S3_REGION": "us-east-1",
    "S3_SECRET_ACCESS_KEY": "secret-key",
    "WEB_ORIGIN": "https://proctoring.example.edu/path"
  }


def test_settings_require_all_service_environment_values() -> None:
  with pytest.raises(ValidationError) as error:
    Settings.from_environment({})

  assert "DATABASE_URL" in str(error.value)


def test_settings_reject_weak_secrets_and_invalid_encryption_keys() -> None:
  environment = valid_environment()
  environment["JWT_SECRET"] = "too-short"
  environment["EVIDENCE_ENCRYPTION_KEY"] = base64.b64encode(bytes(16)).decode()

  with pytest.raises(ValidationError) as error:
    Settings.from_environment(environment)

  assert "JWT_SECRET" in str(error.value)
  assert "EVIDENCE_ENCRYPTION_KEY" in str(error.value)


def test_settings_normalize_public_and_storage_urls() -> None:
  settings = Settings.from_environment(valid_environment())

  assert settings.web_origin == "https://proctoring.example.edu"
  assert settings.api_origin == "https://api.proctoring.example.edu"
  assert settings.api_base_url == "https://api.proctoring.example.edu/api"
  assert settings.s3_endpoint == "https://s3.example.edu"
  assert settings.failure_policy.value == "block"
  assert settings.model_manifest_path == Path("/etc/proctoring/model-weights.json")
  assert settings.sface_cosine_threshold == 0.593
  assert settings.liveness_center_threshold == 0.15
  assert settings.liveness_turn_threshold == 0.30
  assert settings.sface_interval_seconds == 60
  assert settings.staging_retention_minutes == 30
  assert settings.api_host == "127.0.0.1"
  assert settings.api_port == 8000


def test_settings_reject_non_loopback_api_bind() -> None:
  environment = valid_environment()
  environment["API_HOST"] = "0.0.0.0"

  with pytest.raises(ValidationError, match="loopback"):
    Settings.from_environment(environment)


def test_settings_validate_directional_liveness_threshold_order_and_minimum_sface_cadence() -> None:
  environment = valid_environment()
  environment.update({
    "LIVENESS_CENTER_THRESHOLD": "0.4", "LIVENESS_TURN_THRESHOLD": "0.3",
    "SFACE_INTERVAL_SECONDS": "59"
  })

  with pytest.raises(ValidationError):
    Settings.from_environment(environment)


@pytest.mark.parametrize(("origin", "expected"), [
  ("HTTPS://PANEL.Example.EDU:443/path", "https://panel.example.edu"),
  ("http://PANEL.example.edu:80", "http://panel.example.edu"),
  ("https://PANEL.example.edu:8443", "https://panel.example.edu:8443"),
  ("https://[2001:0DB8:0:0:0:0:0:1]:443", "https://[2001:db8::1]")
])
def test_settings_canonicalize_web_origin_like_browser_origin_serialization(origin: str, expected: str) -> None:
  environment = valid_environment()
  environment["WEB_ORIGIN"] = origin

  assert Settings.from_environment(environment).web_origin == expected


def test_settings_canonicalize_the_origins_of_all_configured_http_urls() -> None:
  environment = valid_environment()
  environment["API_PUBLIC_URL"] = "HTTPS://API.Example.EDU:443/proctoring"
  environment["S3_ENDPOINT"] = "http://S3.Example.EDU:8080/storage"

  settings = Settings.from_environment(environment)

  assert settings.api_base_url == "https://api.example.edu/proctoring"
  assert settings.api_origin == "https://api.example.edu"
  assert settings.s3_endpoint == "http://s3.example.edu:8080/storage"


def test_settings_reject_a_non_mysql_database_url() -> None:
  environment = valid_environment()
  environment["DATABASE_URL"] = "postgresql://service:password@127.0.0.1/proctoring"

  with pytest.raises(ValidationError, match="DATABASE_URL must use the mysql: scheme"):
    Settings.from_environment(environment)


@pytest.mark.parametrize("setting, value", [
  ("WEB_ORIGIN", "https://admin:secret@proctoring.example.edu"),
  ("API_PUBLIC_URL", "https://api.proctoring.example.edu:not-a-port/api"),
  ("S3_ENDPOINT", "https://s3.example.edu:70000"),
  ("S3_ENDPOINT", "https://access:secret@s3.example.edu")
])
def test_settings_reject_insecure_or_malformed_public_urls(
  setting: str,
  value: str
) -> None:
  environment = valid_environment()
  environment[setting] = value

  with pytest.raises(ValidationError):
    Settings.from_environment(environment)


@pytest.mark.parametrize("database_url", [
  "mysql://service:password@:3306/proctoring",
  "mysql://service:password@database.example.edu:not-a-port/proctoring",
  "mysql://service:password@database.example.edu:70000/proctoring"
])
def test_settings_reject_malformed_database_hosts_and_ports(database_url: str) -> None:
  environment = valid_environment()
  environment["DATABASE_URL"] = database_url

  with pytest.raises(ValidationError):
    Settings.from_environment(environment)


def test_settings_require_approved_local_weights_when_inference_is_requested(tmp_path: Path) -> None:
  environment = valid_environment()
  environment["INFERENCE_REQUESTED"] = "true"
  environment["MODEL_MANIFEST_PATH"] = str(tmp_path / "model-weights.json")

  with pytest.raises(ValidationError, match="model manifest"):
    Settings.from_environment(environment)

  weights_directory = tmp_path / "weights"
  weights_directory.mkdir()
  artifact = weights_directory / "model.onnx"
  artifact.write_bytes(b"approved-weight")
  manifest_path = tmp_path / "model-weights.json"
  manifest_path.write_text(json.dumps({
    "version": 1,
    "offlineOnly": True,
    "releaseReady": True,
    "weightsDirectory": str(weights_directory),
    "models": [{
      "id": "approved-model",
      "destination": "model.onnx",
      "sha256": hashlib.sha256(b"approved-weight").hexdigest(),
      "status": "approved"
    }]
  }), encoding="utf-8")

  settings = Settings.from_environment(environment)

  assert settings.model_manifest_path == manifest_path


def test_settings_reject_release_blocked_model_manifest_even_when_placeholder_files_match(tmp_path: Path) -> None:
  environment = valid_environment()
  environment["INFERENCE_REQUESTED"] = "true"
  environment["MODEL_MANIFEST_PATH"] = str(tmp_path / "model-weights.json")
  weights = tmp_path / "weights"
  weights.mkdir()
  (weights / "model.onnx").write_bytes(b"local")
  (tmp_path / "model-weights.json").write_text(json.dumps({
    "version": 1, "offlineOnly": True, "releaseReady": False,
    "weightsDirectory": str(weights),
    "models": [{"id": "model", "destination": "model.onnx", "sha256": hashlib.sha256(b"local").hexdigest(), "status": "approved"}]
  }), encoding="utf-8")

  with pytest.raises(ValidationError, match="release-ready"):
    Settings.from_environment(environment)
