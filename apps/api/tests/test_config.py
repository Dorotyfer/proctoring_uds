import base64

import pytest
from pydantic import ValidationError

from proctoring_api.config import Settings


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
  assert settings.model_downloads_allowed is False


def test_settings_reject_a_non_mysql_database_url() -> None:
  environment = valid_environment()
  environment["DATABASE_URL"] = "postgresql://service:password@127.0.0.1/proctoring"

  with pytest.raises(ValidationError, match="DATABASE_URL must use the mysql: scheme"):
    Settings.from_environment(environment)
