"""Typed runtime configuration without startup model loading."""

import base64
import binascii
import ipaddress
import os
from pathlib import Path
from typing import Mapping
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .models import FailurePolicy
from .manifest import ManifestValidationError, validate_model_manifest


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
  s3_force_path_style: bool = Field(default=False, validation_alias="S3_FORCE_PATH_STYLE")
  s3_server_side_encryption: str | None = Field(default="AES256", validation_alias="S3_SERVER_SIDE_ENCRYPTION")
  evidence_retention_days: int = Field(default=30, ge=1, le=3650, validation_alias="EVIDENCE_RETENTION_DAYS")
  failure_policy: FailurePolicy = Field(
    default=FailurePolicy.BLOCK,
    validation_alias="FAILURE_POLICY"
  )
  model_manifest_path: Path = Field(
    default=Path("/etc/proctoring/model-weights.json"),
    validation_alias="MODEL_MANIFEST_PATH"
  )
  inference_requested: bool = Field(
    default=False,
    validation_alias="INFERENCE_REQUESTED"
  )
  sface_cosine_threshold: float = Field(default=0.593, ge=0, le=2, validation_alias="SFACE_COSINE_THRESHOLD")
  liveness_center_threshold: float = Field(default=0.15, ge=0, lt=1, validation_alias="LIVENESS_CENTER_THRESHOLD")
  liveness_turn_threshold: float = Field(default=0.30, gt=0, le=2, validation_alias="LIVENESS_TURN_THRESHOLD")
  sface_interval_seconds: int = Field(default=60, ge=60, validation_alias="SFACE_INTERVAL_SECONDS")

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

  @property
  def evidence_encryption_key_bytes(self) -> bytes:
    return base64.b64decode(self.evidence_encryption_key, validate=True)

  @property
  def biometric_encryption_key_bytes(self) -> bytes:
    return base64.b64decode(self.biometric_encryption_key, validate=True)

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
    _validate_database_url(self.database_url)

    self.web_origin = _origin(self.web_origin)
    self.api_public_url = _absolute_http_url(self.api_public_url).rstrip("/")
    self.s3_endpoint = _absolute_http_url(self.s3_endpoint).rstrip("/")
    if self.s3_server_side_encryption == "none":
      self.s3_server_side_encryption = None
    elif self.s3_server_side_encryption != "AES256":
      raise ValueError("S3_SERVER_SIDE_ENCRYPTION must be AES256 or none")
    if self.inference_requested:
      try:
        manifest = validate_model_manifest(self.model_manifest_path, require_artifacts=True)
      except ManifestValidationError as error:
        raise ValueError(f"model manifest: {error}") from error
      if manifest.get("releaseReady") is not True:
        raise ValueError("model manifest must be release-ready before inference")
    if self.liveness_center_threshold >= self.liveness_turn_threshold:
      raise ValueError("LIVENESS_CENTER_THRESHOLD must be lower than LIVENESS_TURN_THRESHOLD")
    return self


def _absolute_http_url(value: str) -> str:
  parsed = _parse_network_url(value, "HTTP(S) URL")
  if parsed.scheme not in {"http", "https"}:
    raise ValueError("must be an absolute HTTP(S) URL")
  if parsed.username is not None or parsed.password is not None:
    raise ValueError("must not include credentials")
  if parsed.query or parsed.fragment:
    raise ValueError("must not include a query or fragment")
  return f"{_canonical_origin_from_parsed(parsed)}{parsed.path}"


def _origin(value: str) -> str:
  return canonical_http_origin(value)


def canonical_http_origin(value: str) -> str:
  """Serialize an HTTP(S) origin exactly as browsers send the Origin header."""

  parsed = _parse_network_url(value, "HTTP(S) URL")
  if parsed.scheme not in {"http", "https"}:
    raise ValueError("must be an absolute HTTP(S) URL")
  if parsed.username is not None or parsed.password is not None:
    raise ValueError("must not include credentials")
  if parsed.query or parsed.fragment:
    raise ValueError("must not include a query or fragment")
  return _canonical_origin_from_parsed(parsed)


def _canonical_origin_from_parsed(parsed) -> str:
  scheme = parsed.scheme.lower()
  hostname = parsed.hostname
  if hostname is None:
    raise ValueError("must be an absolute HTTP(S) URL")
  try:
    host = ipaddress.ip_address(hostname).compressed
  except ValueError:
    host = hostname.encode("idna").decode("ascii").lower()
  authority = f"[{host}]" if ":" in host else host
  port = parsed.port
  if port is not None and port != (443 if scheme == "https" else 80):
    authority = f"{authority}:{port}"
  return f"{scheme}://{authority}"


def _validate_database_url(value: str) -> None:
  parsed = _parse_network_url(value, "DATABASE_URL")
  if parsed.scheme != "mysql":
    raise ValueError("DATABASE_URL must use the mysql: scheme")


def _parse_network_url(value: str, description: str):
  try:
    parsed = urlsplit(value)
    port = parsed.port
  except ValueError as error:
    raise ValueError(f"{description} must have a valid host and port") from error

  if not parsed.hostname:
    raise ValueError(f"{description} must have a valid host and port")
  if port is not None and not 1 <= port <= 65535:
    raise ValueError(f"{description} must have a valid host and port")
  _validate_hostname(parsed.hostname, description)
  return parsed


def _validate_hostname(hostname: str, description: str) -> None:
  try:
    ipaddress.ip_address(hostname)
    return
  except ValueError:
    pass

  if hostname == "localhost":
    return
  try:
    encoded = hostname.encode("idna").decode("ascii")
  except UnicodeError as error:
    raise ValueError(f"{description} must have a valid host and port") from error

  labels = encoded.split(".")
  if len(encoded) > 253 or any(
    not label
    or len(label) > 63
    or label.startswith("-")
    or label.endswith("-")
    or not all(character.isalnum() or character == "-" for character in label)
    for label in labels
  ):
    raise ValueError(f"{description} must have a valid host and port")
