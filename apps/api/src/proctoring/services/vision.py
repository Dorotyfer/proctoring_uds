"""Model-independent face contracts, liveness, and encrypted SFace descriptors."""

from dataclasses import dataclass, field
import math
import os
import struct
import time
from typing import Callable, Iterable, Sequence

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from proctoring.services.errors import AnalysisUnavailable


SFACE_MODEL = "SFace"
SFACE_DETECTOR = "yunet"
SFACE_METRIC = "cosine"
SFACE_COSINE_THRESHOLD = 0.593
_DESCRIPTOR_MAGIC = b"SFC1"
_DESCRIPTOR_VERSION = 1


class FaceAnalysisError(RuntimeError):
  """Sanitized face-analysis failure that never includes a frame or descriptor."""

  def __init__(self, code: str, message: str) -> None:
    self.code = code
    super().__init__(message)


@dataclass(frozen=True)
class FaceLandmarks:
  left_eye: tuple[float, float]
  right_eye: tuple[float, float]
  nose: tuple[float, float]


@dataclass(frozen=True)
class RawFace:
  descriptor: Sequence[float] = field(repr=False)
  is_real: bool
  landmarks: FaceLandmarks


@dataclass(frozen=True)
class AnalyzedFace:
  descriptor: tuple[float, ...] = field(repr=False)
  is_real: bool
  landmarks: FaceLandmarks


class DeepFaceAdapter:
  """Safe adapter around an injected, preloaded DeepFace inference callable."""

  def __init__(self, infer: Callable[[bytes], Sequence[RawFace]]) -> None:
    self._infer = infer

  def analyze(self, frame: bytes) -> AnalyzedFace:
    try:
      faces = list(self._infer(frame))
    except AnalysisUnavailable:
      raise
    except Exception as error:
      raise AnalysisUnavailable("model_unavailable") from error
    if not faces:
      raise FaceAnalysisError("face_absent", "Exactly one face is required")
    if len(faces) != 1:
      raise FaceAnalysisError("multiple_faces", "Exactly one face is required")
    raw = faces[0]
    try:
      descriptor = normalize_descriptor(raw.descriptor)
    except (TypeError, ValueError) as error:
      raise FaceAnalysisError("invalid_descriptor", "Invalid face descriptor") from error
    return AnalyzedFace(descriptor=descriptor, is_real=bool(raw.is_real), landmarks=raw.landmarks)


@dataclass(frozen=True)
class LivenessResult:
  passed: bool
  observed_steps: tuple[str, str, str]


def validate_liveness(
  faces: Sequence[RawFace | AnalyzedFace],
  challenge_steps: Sequence[str],
  *,
  center_threshold: float = 0.15,
  turn_threshold: float = 0.30,
) -> LivenessResult:
  """Validate the persisted center/directional-turn/center challenge from landmarks."""

  expected = tuple(challenge_steps)
  if len(faces) != 3 or len(expected) != 3 or expected[0] != "center" or expected[2] != "center" or expected[1] not in {"turn-left", "turn-right"}:
    return LivenessResult(False, ("invalid", "invalid", "invalid"))
  if not 0 <= center_threshold < turn_threshold:
    raise ValueError("Liveness thresholds are invalid")
  observed = tuple(_pose(face.landmarks, center_threshold, turn_threshold) for face in faces)
  passed = all(face.is_real for face in faces) and observed == expected
  return LivenessResult(passed, observed)  # type: ignore[arg-type]


def _pose(landmarks: FaceLandmarks, center_threshold: float, turn_threshold: float) -> str:
  eye_midpoint = (float(landmarks.left_eye[0]) + float(landmarks.right_eye[0])) / 2
  eye_distance = abs(float(landmarks.right_eye[0]) - float(landmarks.left_eye[0]))
  if not math.isfinite(eye_distance) or eye_distance <= 0:
    return "unknown"
  yaw = (float(landmarks.nose[0]) - eye_midpoint) / eye_distance
  if not math.isfinite(yaw):
    return "unknown"
  if abs(yaw) <= center_threshold:
    return "center"
  if yaw <= -turn_threshold:
    return "turn-left"
  if yaw >= turn_threshold:
    return "turn-right"
  return "unknown"


def normalize_descriptor(descriptor: Iterable[float]) -> tuple[float, ...]:
  values = tuple(float(value) for value in descriptor)
  if not values or any(not math.isfinite(value) for value in values):
    raise ValueError("Descriptor values must be finite")
  norm = math.sqrt(sum(value * value for value in values))
  if not math.isfinite(norm) or norm == 0:
    raise ValueError("Descriptor norm must be finite and non-zero")
  return tuple(_float32(value / norm) for value in values)


def choose_descriptor_medoid(descriptors: Sequence[Sequence[float]]) -> tuple[float, ...]:
  if len(descriptors) != 3:
    raise ValueError("Exactly three descriptors are required")
  normalized = tuple(normalize_descriptor(descriptor) for descriptor in descriptors)
  dimensions = {len(descriptor) for descriptor in normalized}
  if len(dimensions) != 1:
    raise ValueError("Descriptor dimensions must match")
  totals = [sum(_cosine_distance(candidate, other) for other in normalized) for candidate in normalized]
  return normalized[min(range(3), key=totals.__getitem__)]


@dataclass(frozen=True)
class EncryptedDescriptor:
  ciphertext: bytes = field(repr=False)
  iv: bytes = field(repr=False)
  tag: bytes = field(repr=False)
  descriptor_length: int
  algorithm: str = SFACE_MODEL
  format_version: int = _DESCRIPTOR_VERSION


class DescriptorCipher:
  """AES-256-GCM encryption for versioned little-endian float32 descriptors."""

  def __init__(self, key: bytes) -> None:
    if len(key) != 32:
      raise ValueError("Biometric encryption key must contain 32 bytes")
    self._aes_gcm = AESGCM(key)

  def encrypt(self, descriptor: Sequence[float]) -> EncryptedDescriptor:
    normalized = normalize_descriptor(descriptor)
    payload = struct.pack(f"<4sBH{len(normalized)}f", _DESCRIPTOR_MAGIC, _DESCRIPTOR_VERSION, len(normalized), *normalized)
    iv = os.urandom(12)
    encrypted = self._aes_gcm.encrypt(iv, payload, SFACE_MODEL.encode("ascii"))
    return EncryptedDescriptor(encrypted[:-16], iv, encrypted[-16:], len(normalized))

  def decrypt(self, encrypted: EncryptedDescriptor) -> tuple[float, ...]:
    if encrypted.algorithm != SFACE_MODEL:
      raise ValueError("SFace profile unavailable")
    if len(encrypted.iv) != 12 or len(encrypted.tag) != 16:
      raise ValueError("SFace profile unavailable")
    try:
      payload = self._aes_gcm.decrypt(
        encrypted.iv, encrypted.ciphertext + encrypted.tag, SFACE_MODEL.encode("ascii")
      )
    except (InvalidTag, TypeError, ValueError) as error:
      raise ValueError("SFace profile unavailable") from error
    header_size = struct.calcsize("<4sBH")
    if len(payload) < header_size:
      raise ValueError("SFace profile unavailable")
    magic, version, length = struct.unpack("<4sBH", payload[:header_size])
    if magic != _DESCRIPTOR_MAGIC or version != _DESCRIPTOR_VERSION or length != encrypted.descriptor_length:
      raise ValueError("SFace profile unavailable")
    if len(payload) != header_size + length * 4:
      raise ValueError("SFace profile unavailable")
    return normalize_descriptor(struct.unpack(f"<{length}f", payload[header_size:]))


@dataclass(frozen=True)
class VerificationResult:
  matched: bool
  similarity: float
  distance: float
  threshold: float
  latency_ms: int


class SFaceVerifier:
  def __init__(
    self,
    threshold: float = SFACE_COSINE_THRESHOLD,
    *,
    audit: Callable[[dict[str, object]], None] | None = None,
    clock_ms: Callable[[], int] = lambda: int(time.perf_counter() * 1000),
  ) -> None:
    if not 0 <= threshold <= 2:
      raise ValueError("Invalid SFace threshold")
    self.threshold = threshold
    self._audit = audit or (lambda _: None)
    self._clock_ms = clock_ms

  def verify(
    self, descriptor: Sequence[float], reference: Sequence[float], *, started_ms: int | None = None
  ) -> VerificationResult:
    _validate_pair(descriptor, reference)
    start = self._clock_ms() if started_ms is None else started_ms
    first = normalize_descriptor(descriptor)
    second = normalize_descriptor(reference)
    similarity = max(-1.0, min(1.0, sum(left * right for left, right in zip(first, second, strict=True))))
    distance = 1.0 - similarity
    matched = distance <= self.threshold
    latency_ms = max(0, self._clock_ms() - start)
    self._audit({
      "model": SFACE_MODEL, "detector": SFACE_DETECTOR, "metric": SFACE_METRIC,
      "threshold": self.threshold, "latencyMs": latency_ms,
      "outcome": "matched" if matched else "mismatch",
    })
    return VerificationResult(matched, similarity, distance, self.threshold, latency_ms)


def _validate_pair(first: Sequence[float], second: Sequence[float]) -> None:
  if len(first) != len(second):
    raise ValueError("Descriptor dimensions must match")
  if any(not math.isfinite(float(value)) for value in (*first, *second)):
    raise ValueError("Descriptor values must be finite")


def _cosine_distance(first: Sequence[float], second: Sequence[float]) -> float:
  return 1.0 - sum(left * right for left, right in zip(first, second, strict=True))


def _float32(value: float) -> float:
  return struct.unpack("<f", struct.pack("<f", value))[0]
