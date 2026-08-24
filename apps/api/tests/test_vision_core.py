import math

import pytest

from proctoring.services.vision import (
  DeepFaceAdapter,
  DescriptorCipher,
  FaceAnalysisError,
  FaceLandmarks,
  RawFace,
  SFaceVerifier,
  choose_descriptor_medoid,
  validate_liveness,
)


def face(*, descriptor=(3.0, 4.0), is_real=True, nose=(50.0, 55.0)) -> RawFace:
  return RawFace(
    descriptor=descriptor,
    is_real=is_real,
    landmarks=FaceLandmarks(left_eye=(30.0, 40.0), right_eye=(70.0, 40.0), nose=nose),
  )


@pytest.mark.parametrize("returned, code", [([], "face_absent"), ([face(), face()], "multiple_faces")])
def test_deepface_adapter_rejects_any_face_count_other_than_one(returned, code) -> None:
  adapter = DeepFaceAdapter(lambda _: returned)

  with pytest.raises(FaceAnalysisError) as captured:
    adapter.analyze(b"jpeg bytes must not be retained")

  assert captured.value.code == code
  assert "jpeg" not in repr(captured.value)


def test_deepface_adapter_returns_normalized_float32_without_repr_leaking_descriptor() -> None:
  analyzed = DeepFaceAdapter(lambda _: [face()]).analyze(b"private frame")

  assert analyzed.is_real is True
  assert analyzed.descriptor == pytest.approx((0.6, 0.8))
  assert math.sqrt(sum(value * value for value in analyzed.descriptor)) == pytest.approx(1.0)
  assert "descriptor" not in repr(analyzed)
  assert "0.6" not in repr(analyzed)


@pytest.mark.parametrize("descriptor", [(float("nan"), 1.0), (float("inf"), 1.0), (0.0, 0.0)])
def test_deepface_adapter_rejects_invalid_descriptors_without_echoing_values(descriptor) -> None:
  with pytest.raises(FaceAnalysisError, match="Invalid face descriptor") as captured:
    DeepFaceAdapter(lambda _: [face(descriptor=descriptor)]).analyze(b"private frame")

  assert "nan" not in repr(captured.value).lower()
  assert "inf" not in repr(captured.value).lower()


def test_liveness_requires_three_real_faces_in_exact_center_turn_center_order() -> None:
  frames = [face(nose=(50.0, 55.0)), face(nose=(34.0, 55.0)), face(nose=(51.0, 55.0))]

  result = validate_liveness(frames, ("center", "turn-left", "center"), center_threshold=0.10, turn_threshold=0.30)

  assert result.passed is True
  assert result.observed_steps == ("center", "turn-left", "center")


def test_liveness_is_direction_aware_and_requires_anti_spoof_on_every_frame() -> None:
  reverse_turn = [face(), face(nose=(66.0, 55.0)), face()]
  spoofed = [face(), face(nose=(34.0, 55.0), is_real=False), face()]

  assert validate_liveness(reverse_turn, ("center", "turn-left", "center")).passed is False
  assert validate_liveness(spoofed, ("center", "turn-left", "center")).passed is False


def test_descriptor_medoid_minimizes_total_cosine_distance_and_is_normalized() -> None:
  selected = choose_descriptor_medoid(((1.0, 0.0), (4.0, 1.0), (0.0, 1.0)))

  assert selected == pytest.approx((0.9701425, 0.2425356))
  assert math.sqrt(sum(value * value for value in selected)) == pytest.approx(1.0)


def test_descriptor_cipher_round_trips_versioned_little_endian_float32() -> None:
  cipher = DescriptorCipher(b"k" * 32)

  encrypted = cipher.encrypt((0.6, 0.8))
  decrypted = cipher.decrypt(encrypted)

  assert encrypted.descriptor_length == 2
  assert encrypted.algorithm == "SFace"
  assert decrypted == pytest.approx((0.6, 0.8), abs=1e-6)


def test_descriptor_cipher_never_interprets_legacy_human_ciphertext_as_sface() -> None:
  cipher = DescriptorCipher(b"k" * 32)
  encrypted = cipher.encrypt((1.0, 0.0))

  with pytest.raises(ValueError, match="SFace profile unavailable"):
    cipher.decrypt(encrypted.__class__(**{**encrypted.__dict__, "algorithm": "Human"}))


def test_sface_verifier_records_official_cosine_metadata_for_match_and_mismatch() -> None:
  records = []
  verifier = SFaceVerifier(threshold=0.593, audit=records.append, clock_ms=lambda: 110)

  matched = verifier.verify((1.0, 0.0), (0.9, math.sqrt(0.19)), started_ms=100)
  mismatched = verifier.verify((1.0, 0.0), (0.0, 1.0), started_ms=100)

  assert matched.matched is True
  assert mismatched.matched is False
  assert records == [
    {"model": "SFace", "detector": "yunet", "metric": "cosine", "threshold": 0.593, "latencyMs": 10, "outcome": "matched"},
    {"model": "SFace", "detector": "yunet", "metric": "cosine", "threshold": 0.593, "latencyMs": 10, "outcome": "mismatch"},
  ]


def test_sface_verifier_rejects_dimension_mismatch_and_non_finite_values() -> None:
  verifier = SFaceVerifier()

  with pytest.raises(ValueError, match="dimension"):
    verifier.verify((1.0, 0.0), (1.0,))
  with pytest.raises(ValueError, match="finite"):
    verifier.verify((1.0, float("nan")), (1.0, 0.0))
