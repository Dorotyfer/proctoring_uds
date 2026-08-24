"""MariaDB row and timestamp normalization."""

import json
from datetime import UTC, datetime
from typing import Any


def parse_json(value: str | dict[str, Any] | None) -> dict[str, Any] | None:
  if value is None or isinstance(value, dict):
    return value
  return json.loads(value)


def to_iso_datetime(value: datetime | str) -> str:
  if isinstance(value, str):
    value = datetime.fromisoformat(value.replace("Z", "+00:00"))
  if value.tzinfo is None:
    value = value.replace(tzinfo=UTC)
  return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def to_mariadb_datetime(value: datetime | str) -> str:
  return to_iso_datetime(value).removesuffix("Z").replace("T", " ")
