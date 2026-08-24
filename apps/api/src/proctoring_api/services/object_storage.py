"""Asynchronous boundary around boto3 S3 and MinIO evidence storage."""

import asyncio
import inspect
import re
from typing import Any, Callable

import boto3
from botocore.config import Config
from botocore.exceptions import (
  ClientError,
  ConnectTimeoutError,
  ConnectionClosedError,
  EndpointConnectionError,
  ReadTimeoutError
)


class ObjectStorageError(RuntimeError):
  """A sanitized object-storage failure safe for API and command callers."""


class StorageValidationError(ObjectStorageError):
  """Raised before a malformed S3 operation reaches the network."""


_OBJECT_KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_./-]{0,767}$")


class S3ObjectStorage:
  """Encrypted object operations with bounded retry and no startup I/O."""

  def __init__(
    self,
    bucket: str,
    *,
    client: Any | None = None,
    endpoint_url: str | None = None,
    region_name: str | None = None,
    access_key_id: str | None = None,
    secret_access_key: str | None = None,
    force_path_style: bool = False,
    server_side_encryption: str | None = None,
    connect_timeout_seconds: float = 3,
    read_timeout_seconds: float = 10,
    retry_delay: Callable[[float], Any] | None = None
  ) -> None:
    if not bucket or "/" in bucket or "\\" in bucket:
      raise StorageValidationError("Invalid evidence bucket")
    self._bucket = bucket
    self._server_side_encryption = server_side_encryption
    self._retry_delay = retry_delay or asyncio.sleep
    self._client = client or boto3.client(
      "s3", endpoint_url=endpoint_url, region_name=region_name,
      aws_access_key_id=access_key_id, aws_secret_access_key=secret_access_key,
      config=Config(
        connect_timeout=connect_timeout_seconds,
        read_timeout=read_timeout_seconds,
        retries={"max_attempts": 0},
        s3={"addressing_style": "path" if force_path_style else "auto"}
      )
    )

  async def check(self) -> None:
    await self._run("head_bucket", {"Bucket": self._bucket})

  async def put(self, key: str, body: bytes, content_type: str) -> None:
    _validate_key(key)
    if content_type != "application/octet-stream" or not isinstance(body, bytes):
      raise StorageValidationError("Invalid encrypted evidence upload")
    request: dict[str, Any] = {
      "Bucket": self._bucket, "Key": key, "Body": body, "ContentType": content_type
    }
    if self._server_side_encryption:
      request["ServerSideEncryption"] = self._server_side_encryption
    await self._run("put_object", request)

  async def get(self, key: str) -> bytes:
    _validate_key(key)
    result = await self._run("get_object", {"Bucket": self._bucket, "Key": key})
    body = result.get("Body") if isinstance(result, dict) else None
    if body is None:
      raise ObjectStorageError("Evidence storage unavailable")
    read = getattr(body, "read", None)
    if not callable(read):
      raise ObjectStorageError("Evidence storage unavailable")
    value = await asyncio.to_thread(read)
    if not isinstance(value, bytes):
      raise ObjectStorageError("Evidence storage unavailable")
    return value

  async def delete(self, key: str) -> None:
    _validate_key(key)
    await self._run("delete_object", {"Bucket": self._bucket, "Key": key})

  async def close(self) -> None:
    close = getattr(self._client, "close", None)
    if callable(close):
      await asyncio.to_thread(close)

  async def _run(self, method_name: str, request: dict[str, Any]) -> Any:
    method = getattr(self._client, method_name)
    for attempt in range(3):
      try:
        return await asyncio.to_thread(method, **request)
      except Exception as error:
        if attempt == 2 or not _is_retryable(error):
          raise ObjectStorageError("Evidence storage unavailable") from error
        delayed = self._retry_delay(0.1 * (2 ** attempt))
        if inspect.isawaitable(delayed):
          await delayed
    raise ObjectStorageError("Evidence storage unavailable")


def _validate_key(key: str) -> None:
  if not isinstance(key, str) or not _OBJECT_KEY.fullmatch(key):
    raise StorageValidationError("Invalid evidence object key")
  segments = key.split("/")
  if any(segment in {"", ".", ".."} for segment in segments) or not key.endswith(".enc"):
    raise StorageValidationError("Invalid evidence object key")


def _is_retryable(error: Exception) -> bool:
  status_code = getattr(error, "status_code", None)
  if status_code is None and isinstance(error, ClientError):
    status_code = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
  if isinstance(status_code, int):
    return status_code in {408, 429} or status_code >= 500
  return isinstance(error, (
    ConnectTimeoutError, ConnectionClosedError, EndpointConnectionError, ReadTimeoutError
  ))
