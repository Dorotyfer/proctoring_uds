"""Explicit offline model preload boundary; heavyweight imports occur only here."""

import importlib
from io import BytesIO
import os
from pathlib import Path
from typing import Callable

from proctoring.manifest import validate_model_manifest
from proctoring.services.objects import SSDLiteAdapter
from proctoring.services.vision import DeepFaceAdapter, FaceLandmarks, RawFace


class LocalModelBundle:
  def __init__(
    self,
    manifest_path: Path,
    *,
    importer: Callable[[str], object] = importlib.import_module,
    required_model_ids: frozenset[str] = frozenset(),
  ) -> None:
    self._manifest_path = Path(manifest_path)
    self._importer = importer
    self._required_model_ids = required_model_ids
    self.modules: dict[str, object] = {}
    self.manifest: dict | None = None
    self.deepface_adapter: DeepFaceAdapter | None = None
    self.ssdlite_adapter: SSDLiteAdapter | None = None

  def preload(self) -> None:
    if self.modules:
      return
    self.manifest = validate_model_manifest(self._manifest_path, require_artifacts=True)
    if self.manifest.get("releaseReady") is not True:
      raise ValueError("Model manifest is not release-ready")
    model_ids = {model["id"] for model in self.manifest["models"]}
    if not self._required_model_ids <= model_ids:
      raise ValueError("Model manifest does not contain every required worker model")
    weights_root = Path(self.manifest["weightsDirectory"]).resolve()
    if weights_root.name != "weights" or weights_root.parent.name != ".deepface":
      raise ValueError("DeepFace weightsDirectory must end in .deepface/weights")
    os.environ["DEEPFACE_HOME"] = str(weights_root.parent.parent)
    for name in ("cv2", "numpy", "deepface", "torch", "torchvision"):
      self.modules[name] = self._importer(name)
    deepface_api = getattr(self.modules["deepface"], "DeepFace", self.modules["deepface"])
    build_model = getattr(deepface_api, "build_model", None)
    if callable(build_model):
      build_model(task="facial_recognition", model_name="SFace")
      build_model(task="face_detector", model_name="yunet")
      build_model(task="spoofing", model_name="Fasnet")
    self.deepface_adapter = build_deepface_adapter(
      self.modules["cv2"], self.modules["numpy"], self.modules["deepface"],
      yunet_weights=_model_path(self.manifest, "opencv-face-detection-yunet-2023mar")
    )
    ssdlite_path = _model_path(self.manifest, "torchvision-ssdlite320-mobilenet-v3-large")
    if ssdlite_path is not None:
      self.ssdlite_adapter = build_ssdlite_adapter(
        self.modules["torch"], self.modules["torchvision"], ssdlite_path
      )


def build_deepface_adapter(
  cv2_module: object, numpy_module: object, deepface_module: object, *, yunet_weights: Path | None = None
) -> DeepFaceAdapter:
  """Build a DeepFace callable only after the worker has imported verified local runtimes."""

  api = getattr(deepface_module, "DeepFace", deepface_module)
  detector = None
  if yunet_weights is not None:
    create_detector = getattr(cv2_module, "FaceDetectorYN_create", None)
    if create_detector is None and hasattr(cv2_module, "FaceDetectorYN"):
      create_detector = cv2_module.FaceDetectorYN.create
    if create_detector is None:
      raise ValueError("YuNet detector runtime unavailable")
    detector = create_detector(str(yunet_weights), "", (320, 320), 0.9, 0.3, 5000)

  def infer(frame: bytes) -> list[RawFace]:
    encoded = numpy_module.frombuffer(frame, dtype=numpy_module.uint8)
    image = cv2_module.imdecode(encoded, cv2_module.IMREAD_COLOR)
    yunet_landmarks = None
    if detector is not None:
      height, width = image.shape[:2]
      detector.setInputSize((width, height))
      _, detected = detector.detect(image)
      rows = [] if detected is None else list(detected)
      yunet_landmarks = [
        FaceLandmarks(
          left_eye=(float(row[6]), float(row[7])),
          right_eye=(float(row[4]), float(row[5])),
          nose=(float(row[8]), float(row[9])),
        ) for row in rows
      ]
    extracted = api.extract_faces(
      img_path=image,
      detector_backend="yunet",
      enforce_detection=False,
      align=True,
      anti_spoofing=True,
    )
    faces = []
    for index, item in enumerate(extracted):
      area = item.get("facial_area", {})
      if float(item.get("confidence", area.get("confidence", 0))) <= 0:
        continue
      landmarks = yunet_landmarks[index] if yunet_landmarks is not None and index < len(yunet_landmarks) else None
      if landmarks is None:
        left_eye, right_eye, nose = area.get("left_eye"), area.get("right_eye"), area.get("nose")
        if not all(isinstance(point, (tuple, list)) and len(point) == 2 for point in (left_eye, right_eye, nose)):
          continue
        landmarks = FaceLandmarks(tuple(left_eye), tuple(right_eye), tuple(nose))
      represented = api.represent(
        img_path=item["face"], model_name="SFace", detector_backend="skip",
        enforce_detection=False, align=False,
      )
      if not represented:
        continue
      faces.append(RawFace(
        descriptor=represented[0]["embedding"],
        is_real=item.get("is_real") is True,
        landmarks=landmarks,
      ))
    return faces

  return DeepFaceAdapter(infer)


def build_ssdlite_adapter(
  torch_module: object,
  torchvision_module: object,
  weights_path: Path,
  *,
  decoder: Callable[[bytes], object] | None = None,
) -> SSDLiteAdapter:
  """Load SSDLite with downloads disabled and a caller-verified local state dict."""

  model = torchvision_module.models.detection.ssdlite320_mobilenet_v3_large(
    weights=None, weights_backbone=None
  )
  state = torch_module.load(Path(weights_path), map_location="cpu", weights_only=True)
  model.load_state_dict(state)
  model.eval()

  def default_decoder(frame: bytes) -> object:
    from PIL import Image
    functional = torchvision_module.transforms.functional
    with Image.open(BytesIO(frame)) as image:
      return functional.pil_to_tensor(image.convert("RGB")).float().div(255)

  decode = decoder or default_decoder

  def infer(frame: bytes) -> list[dict[str, object]]:
    with torch_module.inference_mode():
      output = model([decode(frame)])[0]
    return [
      {"label": label, "score": score, "box": box}
      for label, score, box in zip(
        output["labels"].tolist(), output["scores"].tolist(), output["boxes"].tolist(), strict=True
      )
    ]

  return SSDLiteAdapter(infer)


def _model_path(manifest: dict, model_id: str) -> Path | None:
  root = Path(manifest["weightsDirectory"])
  for model in manifest["models"]:
    if model["id"] == model_id:
      return root / model["destination"]
  return None
