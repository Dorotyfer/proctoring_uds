"""Typed runtime configuration without startup model loading."""

import base64
import binascii
import os
from typing import Mapping
from urllib.parse import urlsplit, urlunsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .models import FailurePolicy


class Settings(BaseModel):
  """Validated configuration required by API and worker processes."""

  model_config = ConfigDict(extra="ignore", populate_by_name=True)

  database_url: str = Field(validation_alias="DATABASE_URL")
  moodle_integration_key: str = Field(min_length=32, validation_alias="MOODLE_INTEGRATION_KEY")
  jwt_secret: str = Field(min_length=32, validation_alias="JWT_SECRET")
  evidence_encryption_key: str = Field(validation_alias="EVIDENCE_ENCRYPTION_KEY")
  biometric_encryption_key: str = Field(validation_alias="BIOMETRIC_ENCRYPTION_KEY")
  web_origin: str = Field(validation_alias="WEB_ORIGIN")
  api_public_url: str = Field(validation_alias="API_PUBLIC_URL")
  panel_sso_secret: str = Field(min_length=32, validation_alias="PANEL_SSO_SECRET")
  s3_endpoint: str = Field(validation_alias="S3_ENDPOINT")
  s3_region: str = Field(min_length=1, validation_alias="S3_REGION")
  s3_bucket: str = Field(min_length=1, validation_alias="S3_BUCKET")
  s3_access_key_id: str = Field(min_length=1, validation_alias="S3_ACCESS_KEY_ID")
  s3_secret_access_key: str = Field(min_length=1, validation_alias="S3_SECRET_ACCESS_KEY")
  failure_policy: FailurePolicy = Field(
    default=FailurePolicy.BLOCK,
    validation_alias="FAILURE_POLICY"
  )
  model_weights_dir: str = Field(
    default="/opt/proctoring/model-weights",
    validation_alias="MODEL_WEIGHTS_DIR"
  )
  model_downloads_allowed: bool = Field(
    default=False,
    validation_alias="MODEL_DOWNLOADS_ALLOWED"
  )

  @classmethod
  def from_environment(cls, environment: Mapping[str, str]) -> "Settings":
    return cls.model_validate(dict(environment))

  @classmethod
  def from_process_environment(cls) -> "Settings":
    return cls.from_environment(os.environ)

  @property
  def api_origin(self) -> str:
    return _origin(self.api_public_url)

  @property
  def api_base_url(self) -> str:
    return self.api_public_url.rstrip("/")

  @field_validator("evidence_encryption_key", "biometric_encryption_key")
  @classmethod
  def validate_encryption_key(cls, value: str) -> str:
    try:
      decoded = base64.b64decode(value, validate=True)
    except binascii.Error as error:
      raise ValueError("must be a base64-encoded 32-byte key") from error

    if len(decoded) != 32:
      raise ValueError("must be a base64-encoded 32-byte key")
    return value

  @model_validator(mode="after")
  def validate_and_normalize_urls(self) -> "Settings":
    database = urlsplit(self.database_url)
    if database.scheme != "mysql" or not database.hostname:
      raise ValueError("DATABASE_URL must use the mysql: scheme")

    self.web_origin = _origin(self.web_origin)
    self.api_public_url = _absolute_http_url(self.api_public_url).rstrip("/")
    self.s3_endpoint = _absolute_http_url(self.s3_endpoint).rstrip("/")
    return self


def _absolute_http_url(value: str) -> str:
  parsed = urlsplit(value)
  if parsed.scheme not in {"http", "https"} or not parsed.netloc:
    raise ValueError("must be an absolute HTTP(S) URL")
  return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, parsed.query, ""))


def _origin(value: str) -> str:
  parsed = urlsplit(_absolute_http_url(value))
  return urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))
