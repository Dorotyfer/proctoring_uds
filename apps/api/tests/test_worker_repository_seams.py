import asyncio
from datetime import UTC, datetime, timedelta

from proctoring.repositories.analysis import SqlAnalysisRepository
from proctoring.repositories.effects import SqlAnalysisEffectsRepository
from proctoring.repositories.monitoring import SqlMonitoringRepository


class Result:
  def __init__(self, rows=(), rowcount=1): self.rows = list(rows); self.rowcount = rowcount
  def mappings(self): return self
  def first(self): return self.rows[0] if self.rows else None
  def all(self): return self.rows


class Context:
  def __init__(self, connection): self.connection = connection
  async def __aenter__(self): return self.connection
  async def __aexit__(self, *_): return None


class Connection:
  def __init__(self, results): self.results = iter(results); self.statements = []
  async def execute(self, statement, parameters=None): self.statements.append((str(statement), parameters)); return next(self.results)


class Engine:
  def __init__(self, results): self.connection = Connection(results)
  def connect(self): return Context(self.connection)
  def begin(self): return Context(self.connection)


def test_analysis_repository_returns_ordered_staging_metadata_without_ciphertext() -> None:
  engine = Engine([Result([{
    "id": "frame-1", "frame_order": 0, "object_key": "staging/frame.enc",
    "encryption_iv": b"i" * 12, "encryption_tag": b"t" * 16, "sha256": "a" * 64,
    "byte_size": 10, "width": 320, "height": 240, "cleanup_state": "pending"
  }])])

  frames = asyncio.run(SqlAnalysisRepository(engine).frames_for_job("job-1"))

  assert frames == [{
    "id": "frame-1", "frameOrder": 0, "objectKey": "staging/frame.enc",
    "encryptionIv": b"i" * 12, "encryptionTag": b"t" * 16, "sha256": "a" * 64,
    "byteSize": 10, "width": 320, "height": 240, "cleanupState": "pending"
  }]
  assert "ciphertext" not in engine.connection.statements[0][0].lower()


def test_monitoring_repository_reserves_sface_atomically_at_sixty_second_boundary() -> None:
  engine = Engine([Result(), Result(rowcount=1)])
  now = datetime(2026, 8, 24, 12, 1, tzinfo=UTC)

  reserved = asyncio.run(SqlMonitoringRepository(engine).reserve_sface("session-1", now, timedelta(seconds=60)))

  assert reserved is True
  update, parameters = engine.connection.statements[1]
  assert "last_sface_check_at <= :cutoff" in update
  assert parameters["cutoff"] == now - timedelta(seconds=60)


def test_monitoring_repository_confirms_anomaly_from_two_of_latest_three_observations() -> None:
  engine = Engine([
    Result(),
    Result([{"anomalies": '["environment_intrusion"]'}, {"anomalies": "[]"}, {"anomalies": '["environment_intrusion"]'}]),
    Result(),
  ])

  confirmed = asyncio.run(SqlMonitoringRepository(engine).observe(
    "session-1", {"environment_intrusion"}, datetime(2026, 8, 24, 12, 0, tzinfo=UTC)
  ))

  assert confirmed == {"environment_intrusion"}
  assert "LIMIT 3" in engine.connection.statements[1][0]


def test_monitoring_repository_does_not_confirm_before_full_three_observation_window() -> None:
  engine = Engine([
    Result(),
    Result([{"anomalies": '["environment_intrusion"]'}, {"anomalies": '["environment_intrusion"]'}]),
    Result(),
  ])

  confirmed = asyncio.run(SqlMonitoringRepository(engine).observe(
    "session-1", {"environment_intrusion"}, datetime(2026, 8, 24, 12, 0, tzinfo=UTC)
  ))

  assert confirmed == set()


def test_monitoring_observation_is_idempotent_for_the_analysis_job() -> None:
  engine = Engine([
    Result(), Result([{"anomalies": '["environment_intrusion"]'}]), Result(),
  ])

  asyncio.run(SqlMonitoringRepository(engine).observe(
    "session-1", {"environment_intrusion"}, datetime(2026, 8, 24, 12, 0, tzinfo=UTC),
    observation_id="job-1",
  ))

  insert, parameters = engine.connection.statements[0]
  assert "job_id" in insert
  assert "ON DUPLICATE KEY UPDATE" in insert
  assert parameters["job_id"] == "job-1"


def test_inference_event_and_alert_use_deterministic_ids_and_upserts() -> None:
  engine = Engine([Result(), Result(), Result(), Result()])
  repository = SqlAnalysisEffectsRepository(engine, object())

  first = asyncio.run(repository.create_event_alert(
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "environment_intrusion",
  ))
  second = asyncio.run(repository.create_event_alert(
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "environment_intrusion",
  ))

  assert first == second
  event_statements = engine.connection.statements[::2]
  alert_statements = engine.connection.statements[1::2]
  assert all("ON DUPLICATE KEY UPDATE" in statement for statement, _ in event_statements)
  assert all("ON DUPLICATE KEY UPDATE" in statement for statement, _ in alert_statements)
  assert event_statements[0][1]["id"] == event_statements[1][1]["id"]
  assert alert_statements[0][1]["id"] == alert_statements[1][1]["id"]
