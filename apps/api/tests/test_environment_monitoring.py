import asyncio
from datetime import UTC, datetime, timedelta

from proctoring.services.monitoring import ConfirmationService, MonitoringCadence
from proctoring.services.objects import SSDLiteAdapter


def test_ssdlite_filters_coco_classes_with_class_specific_inclusive_thresholds() -> None:
  adapter = SSDLiteAdapter(lambda _: [
    {"label": 1, "score": 0.70, "box": (0, 0, 10, 10)},
    {"label": 77, "score": 0.60, "box": (1, 1, 5, 5)},
    {"label": 73, "score": 0.59, "box": (2, 2, 4, 4)},
    {"label": 84, "score": 0.91, "box": (2, 2, 6, 6)},
    {"label": 18, "score": 0.99, "box": (0, 0, 2, 2)},
  ])

  detected = adapter.detect(b"frame")

  assert [(item.name, item.score) for item in detected] == [
    ("person", 0.70), ("cell phone", 0.60), ("book", 0.91)
  ]


def test_ssdlite_maps_multiple_people_or_any_relevant_object_to_environment_intrusion() -> None:
  multiple_people = SSDLiteAdapter(lambda _: [
    {"label": 1, "score": 0.9, "box": (0, 0, 1, 1)},
    {"label": 1, "score": 0.8, "box": (1, 1, 2, 2)},
  ])
  laptop = SSDLiteAdapter(lambda _: [{"label": 73, "score": 0.8, "box": (0, 0, 1, 1)}])

  assert multiple_people.anomaly(multiple_people.detect(b"frame")) == "environment_intrusion"
  assert laptop.anomaly(laptop.detect(b"frame")) == "environment_intrusion"


class ConfirmationRepository:
  def __init__(self) -> None:
    self.windows = {}

  async def observe(self, session_id, anomalies, observed_at):
    window = self.windows.setdefault(session_id, [])
    window.append(set(anomalies))
    del window[:-3]
    return {name for name in set().union(*window) if sum(name in observation for observation in window) >= 2}


def test_confirmation_recommends_two_followups_then_confirms_same_anomaly_in_two_of_three() -> None:
  service = ConfirmationService(ConfirmationRepository())
  now = datetime(2026, 8, 24, 12, 0, tzinfo=UTC)

  initial = asyncio.run(service.observe("session-1", {"environment_intrusion"}, now))
  middle = asyncio.run(service.observe("session-1", set(), now + timedelta(seconds=2)))
  confirmed = asyncio.run(service.observe("session-1", {"environment_intrusion"}, now + timedelta(seconds=4)))

  assert initial.confirmed == frozenset()
  assert initial.follow_up_frames == 2
  assert initial.follow_up_interval_seconds == 2
  assert middle.confirmed == frozenset()
  assert confirmed.confirmed == frozenset({"environment_intrusion"})


class CadenceRepository:
  def __init__(self) -> None:
    self.last = {}

  async def reserve_sface(self, session_id, now, minimum_interval):
    previous = self.last.get(session_id)
    if previous is not None and now - previous < minimum_interval:
      return False
    self.last[session_id] = now
    return True


def test_monitoring_sface_runs_at_most_once_per_sixty_seconds_per_session() -> None:
  cadence = MonitoringCadence(CadenceRepository())
  now = datetime(2026, 8, 24, 12, 0, tzinfo=UTC)

  assert asyncio.run(cadence.should_run_sface("session-1", now)) is True
  assert asyncio.run(cadence.should_run_sface("session-1", now + timedelta(seconds=59))) is False
  assert asyncio.run(cadence.should_run_sface("session-1", now + timedelta(seconds=60))) is True
