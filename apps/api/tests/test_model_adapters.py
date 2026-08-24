from contextlib import contextmanager

from proctoring_api.model_runtime import build_deepface_adapter, build_ssdlite_adapter


class Numpy:
  uint8 = "uint8"
  @staticmethod
  def frombuffer(frame, dtype): return (frame, dtype)


class Cv2:
  IMREAD_COLOR = 1
  @staticmethod
  def imdecode(encoded, mode): return {"decoded": encoded, "mode": mode}


class DeepFaceApi:
  def __init__(self): self.calls = []

  def extract_faces(self, **kwargs):
    self.calls.append(("extract_faces", kwargs))
    return [{
      "face": "aligned-face", "is_real": True, "confidence": 0.99,
      "facial_area": {"left_eye": (30, 40), "right_eye": (70, 40), "nose": (50, 55)}
    }]

  def represent(self, **kwargs):
    self.calls.append(("represent", kwargs))
    return [{"embedding": [3.0, 4.0]}]

  def analyze(self, **kwargs):
    raise AssertionError("demographic/emotion analysis is forbidden")


def test_deepface_preloaded_adapter_uses_sface_yunet_and_fasnet_anti_spoofing() -> None:
  api = DeepFaceApi()
  adapter = build_deepface_adapter(Cv2(), Numpy(), api)

  face = adapter.analyze(b"jpeg")

  extract = api.calls[0]
  represent = api.calls[1]
  assert extract[1]["detector_backend"] == "yunet"
  assert extract[1]["anti_spoofing"] is True
  assert represent[1]["model_name"] == "SFace"
  assert represent[1]["detector_backend"] == "skip"
  assert face.is_real is True


class Tensor:
  def __init__(self, values): self.values = values
  def tolist(self): return self.values


class Model:
  def __init__(self): self.loaded = None; self.evaluated = False
  def load_state_dict(self, state): self.loaded = state
  def eval(self): self.evaluated = True; return self
  def __call__(self, tensors):
    return [{"labels": Tensor([1, 77]), "scores": Tensor([0.71, 0.61]), "boxes": Tensor([[0, 0, 1, 1], [1, 1, 2, 2]])}]


class Torch:
  def __init__(self): self.load_calls = []; self.inference_entries = 0
  def load(self, path, **kwargs): self.load_calls.append((path, kwargs)); return {"weight": 1}
  @contextmanager
  def inference_mode(self): self.inference_entries += 1; yield


class Detection:
  def __init__(self, model): self.model = model; self.calls = []
  def ssdlite320_mobilenet_v3_large(self, **kwargs): self.calls.append(kwargs); return self.model


class Models:
  def __init__(self, detection): self.detection = detection


class Torchvision:
  def __init__(self, detection): self.models = Models(detection)


def test_ssdlite_preloaded_adapter_loads_local_weights_and_uses_eval_inference_mode(tmp_path) -> None:
  weight = tmp_path / "ssdlite.pth"
  weight.write_bytes(b"local")
  model = Model()
  detection = Detection(model)
  torch = Torch()
  adapter = build_ssdlite_adapter(torch, Torchvision(detection), weight, decoder=lambda _: "tensor")

  detected = adapter.detect(b"jpeg")

  assert detection.calls == [{"weights": None, "weights_backbone": None}]
  assert torch.load_calls == [(weight, {"map_location": "cpu", "weights_only": True})]
  assert model.loaded == {"weight": 1}
  assert model.evaluated is True
  assert torch.inference_entries == 1
  assert [item.name for item in detected] == ["person", "cell phone"]
