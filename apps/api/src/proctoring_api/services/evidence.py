"""Evidence lifecycle, scoped content tokens, and retention."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import ipaddress
import re
from typing import Any, Callable, Mapping, Protocol
from uuid import uuid4

import jwt

from proctoring_api.services.evidence_crypto import EvidenceCryptoError, EvidenceEncryptionService


CONTENT_AUDIENCE = "proctoring-evidence"


class EvidenceAccessError(RuntimeError):
  """Sanitized failure for evidence authorization and delivery."""


class ObjectStorage(Protocol):
  async def put(self, key: str, body: bytes, content_type: str) -> None: ...
  async def get(self, key: str) -> bytes: ...
  async def delete(self, key: str) -> None: ...


class EvidenceRepository(Protocol):
  async def create(self, input_data: dict[str, Any]) -> dict[str, Any]: ...
  async def find_by_id(self, evidence_id: str) -> dict[str, Any] | None: ...
  async def audit(self, input_data: dict[str, Any]) -> None: ...
  async def find_expired(self, limit: int) -> list[dict[str, Any]]: ...
  async def mark_deleted(self, evidence_id: str) -> None: ...


@dataclass(frozen=True)
class EvidenceContent:
  body: bytes
  headers: dict[str, str]


class EvidenceService:
  def __init__(
    self,
    encryption_service: EvidenceEncryptionService,
    object_storage: ObjectStorage,
    repository: EvidenceRepository,
    *,
    retention_days: int,
    content_token_secret: str,
    now: Callable[[], datetime] = lambda: datetime.now(UTC)
  ) -> None:
    if not 1 <= retention_days <= 3650:
      raise ValueError("Evidence retention days must be between 1 and 3650")
    if len(content_token_secret) < 32:
      raise ValueError("Evidence content token secret must contain at least 32 characters")
    self._encryption_service = encryption_service
    self._object_storage = object_storage
    self._repository = repository
    self._retention_days = retention_days
    self._content_token_secret = content_token_secret
    self._now = now

  async def store_identity(self, session_id: str, capture: bytes) -> dict[str, Any]:
    return await self.store_capture(session_id, "identity", capture)

  async def store_capture(
    self, session_id: str, kind: str, capture: bytes, *, event_id: str | None = None
  ) -> dict[str, Any]:
    if kind not in {"identity", "interval", "alert"} or not capture:
      raise ValueError("Invalid evidence capture")
    object_id = str(uuid4())
    object_key = _evidence_object_key(session_id, kind, object_id)
    encrypted = self._encryption_service.encrypt(capture)
    await self._object_storage.put(object_key, encrypted.ciphertext, "application/octet-stream")
    input_data = {
      "sessionId": session_id, "kind": kind, "eventId": event_id, "objectKey": object_key,
      "contentType": "image/jpeg", "byteSize": len(capture), "sha256": encrypted.sha256,
      "encryptionIv": encrypted.iv, "encryptionTag": encrypted.tag,
      "expiresAt": self._now() + timedelta(days=self._retention_days)
    }
    try:
      evidence = await self._repository.create(input_data)
    except Exception:
      try:
        await self._object_storage.delete(object_key)
      except Exception:
        pass
      raise
    if evidence["objectKey"] != object_key:
      await self._object_storage.delete(object_key)
    return evidence

  async def read_authorized(self, evidence: Mapping[str, Any]) -> bytes:
    try:
      ciphertext = await self._object_storage.get(str(evidence["objectKey"]))
      return self._encryption_service.decrypt({
        "ciphertext": ciphertext, "iv": bytes(evidence["encryptionIv"]), "tag": bytes(evidence["encryptionTag"])
      })
    except (EvidenceCryptoError, KeyError, TypeError, ValueError) as error:
      raise EvidenceAccessError("Evidence content unavailable") from error

  async def issue_content_token(
    self,
    evidence_id: str,
    actor_id: str,
    can_view_evidence: bool,
    course_ids: set[str],
    institutional: bool,
    ip_address: str | None,
    user_agent: str | None
  ) -> str:
    evidence = await self._repository.find_by_id(evidence_id)
    if not _may_view(evidence, can_view_evidence, course_ids, institutional):
      raise EvidenceAccessError("Evidence access unavailable")
    context = _audit_context(ip_address, user_agent)
    await self._repository.audit({
      "evidenceId": evidence_id, "actorId": actor_id, "action": "view",
      **context
    })
    now = self._now()
    return jwt.encode({
      "evidenceId": evidence_id, "moodleUserId": actor_id, "aud": CONTENT_AUDIENCE,
      "iat": now, "exp": now + timedelta(seconds=60)
    }, self._content_token_secret, algorithm="HS256")

  async def read_content(
    self, evidence_id: str, access_token: str, *, ip_address: str | None = None, user_agent: str | None = None
  ) -> EvidenceContent:
    try:
      claims = jwt.decode(access_token, self._content_token_secret, algorithms=["HS256"], audience=CONTENT_AUDIENCE,
        options={"require": ["exp", "iat", "aud", "evidenceId", "moodleUserId"]})
      if claims.get("evidenceId") != evidence_id:
        raise EvidenceAccessError("Evidence content unavailable")
      evidence = await self._repository.find_by_id(evidence_id)
      if not evidence or evidence.get("kind") != "alert":
        raise EvidenceAccessError("Evidence content unavailable")
      body = await self.read_authorized(evidence)
      context = _audit_context(ip_address, user_agent)
      await self._repository.audit({
        "evidenceId": evidence_id, "actorId": claims["moodleUserId"], "action": "download",
        **context
      })
      return EvidenceContent(body, {
        "Cache-Control": "private, no-store", "Content-Disposition": 'inline; filename="evidence.jpg"',
        "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff"
      })
    except EvidenceAccessError:
      raise
    except Exception as error:
      raise EvidenceAccessError("Evidence content unavailable") from error

  async def purge_expired(self, actor_id: str = "system:retention") -> int:
    expired = await self._repository.find_expired(100)
    deleted = 0
    for evidence in expired:
      await self._object_storage.delete(str(evidence["objectKey"]))
      await self._repository.audit({
        "evidenceId": evidence["id"], "actorId": actor_id, "action": "retention_delete",
        "ipAddress": None, "userAgent": "retention-job"
      })
      await self._repository.mark_deleted(str(evidence["id"]))
      deleted += 1
    return deleted


def _evidence_object_key(session_id: str, kind: str, object_id: str) -> str:
  for value in (session_id, object_id):
    if not value or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for character in value):
      raise ValueError("Invalid evidence identifier")
  return f"{session_id}/{kind}/{object_id}.enc"


def _may_view(
  evidence: Mapping[str, Any] | None, can_view_evidence: bool, course_ids: set[str], institutional: bool
) -> bool:
  return bool(evidence and evidence.get("kind") == "alert" and can_view_evidence and (
    institutional or str(evidence.get("courseId")) in course_ids
  ))


def _audit_context(ip_address: str | None, user_agent: str | None) -> dict[str, str | None]:
  clean_ip = None
  if isinstance(ip_address, str):
    candidate = ip_address.strip()
    try:
      clean_ip = str(ipaddress.ip_address(candidate))
    except ValueError:
      pass
  clean_user_agent = None
  if isinstance(user_agent, str):
    candidate = re.sub(r"[\x00-\x1f\x7f]", "", user_agent).strip()
    if candidate:
      clean_user_agent = candidate[:512]
  return {"ipAddress": clean_ip, "userAgent": clean_user_agent}
