"""AES-256-GCM evidence encryption with the historical wire format."""

from dataclasses import dataclass
from hashlib import sha256
import os
from typing import Mapping

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class EvidenceCryptoError(RuntimeError):
  """A deliberately non-diagnostic evidence cryptography failure."""


@dataclass(frozen=True)
class EncryptedEvidence:
  ciphertext: bytes
  iv: bytes
  tag: bytes
  sha256: str

  def wire_object(self) -> dict[str, bytes]:
    """Match the historical ciphertext, IV, and authentication-tag fields."""

    return {"ciphertext": self.ciphertext, "iv": self.iv, "tag": self.tag}


class EvidenceEncryptionService:
  """AES-256-GCM with a 12-byte nonce and detached 16-byte tag format."""

  def __init__(self, key: bytes, *, key_version: str | None = None) -> None:
    if len(key) != 32:
      raise ValueError("Evidence encryption key must contain 32 bytes")
    self._aes_gcm = AESGCM(key)
    # Historical evidence has no key-version column. Keep this constructor
    # argument only for callers coordinating external rotation metadata.
    self.key_version = key_version

  def encrypt(self, plaintext: bytes) -> EncryptedEvidence:
    iv = os.urandom(12)
    encrypted = self._aes_gcm.encrypt(iv, plaintext, None)
    return EncryptedEvidence(
      ciphertext=encrypted[:-16],
      iv=iv,
      tag=encrypted[-16:],
      sha256=sha256(plaintext).hexdigest()
    )

  def decrypt(self, input_data: EncryptedEvidence | Mapping[str, bytes]) -> bytes:
    if isinstance(input_data, EncryptedEvidence):
      ciphertext, iv, tag = input_data.ciphertext, input_data.iv, input_data.tag
    else:
      ciphertext = input_data.get("ciphertext")
      iv = input_data.get("iv")
      tag = input_data.get("tag")
    if not all(isinstance(value, bytes) for value in (ciphertext, iv, tag)):
      raise EvidenceCryptoError("Evidence decryption failed")
    if len(iv) != 12 or len(tag) != 16:
      raise EvidenceCryptoError("Evidence decryption failed")
    try:
      return self._aes_gcm.decrypt(iv, ciphertext + tag, None)
    except (InvalidTag, ValueError, TypeError) as error:
      raise EvidenceCryptoError("Evidence decryption failed") from error
