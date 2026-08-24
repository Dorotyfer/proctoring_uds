"""Model-independent SSDLite filtering and environment anomaly policy."""

from dataclasses import dataclass, field
from typing import Callable, Iterable, Mapping, Sequence


COCO_RELEVANT_CLASSES = {1: "person", 72: "tv", 73: "laptop", 77: "cell phone", 84: "book"}


@dataclass(frozen=True)
class ObjectDetection:
  name: str
  score: float
  box: tuple[float, float, float, float] = field(repr=False)


class SSDLiteAdapter:
  def __init__(self, infer: Callable[[bytes], Iterable[Mapping[str, object]]]) -> None:
    self._infer = infer

  def detect(self, frame: bytes) -> tuple[ObjectDetection, ...]:
    relevant = []
    for raw in self._infer(frame):
      label = int(raw["label"])
      score = float(raw["score"])
      name = COCO_RELEVANT_CLASSES.get(label)
      threshold = 0.70 if name == "person" else 0.60
      if name is not None and score >= threshold:
        relevant.append(ObjectDetection(name, score, tuple(float(value) for value in raw["box"])))
    return tuple(relevant)

  @staticmethod
  def anomaly(detections: Sequence[ObjectDetection]) -> str | None:
    people = sum(item.name == "person" for item in detections)
    has_environment_object = any(item.name != "person" for item in detections)
    return "environment_intrusion" if people > 1 or has_environment_object else None
