import asyncio
from datetime import UTC, datetime

from proctoring.repositories.analysis import SqlAnalysisRepository


class Result:
  def __init__(self, row=None): self._row = row
  def mappings(self): return self
  def first(self): return self._row


class SharedQueueConnection:
  def __init__(self):
    self.locked = False
    self.claimed = False
    self.owners = []
    self.job = {
      "id": "job-1", "analysis_id": "analysis-1", "session_id": "session-1", "type": "monitoring",
      "state": "queued", "attempt_count": 0, "created_at": datetime.now(UTC), "completed_at": None, "result": None
    }

  async def execute(self, statement, parameters=None):
    query = str(statement)
    if "SELECT * FROM proctoring_analysis_jobs" in query:
      if "FOR UPDATE SKIP LOCKED" not in query:
        raise AssertionError("workers must use SKIP LOCKED")
      if self.locked or self.claimed:
        return Result()
      self.locked = True
      return Result(self.job)
    if "SET state = 'processing'" in query:
      self.claimed = True
      self.owners.append(parameters["owner_token"])
      return Result()
    return Result()


class Transaction:
  def __init__(self, connection): self.connection = connection
  async def __aenter__(self): return self.connection
  async def __aexit__(self, *_): return None


class Engine:
  def __init__(self): self.connection = SharedQueueConnection()
  def begin(self): return Transaction(self.connection)


def test_concurrent_workers_claim_one_job_once_with_skip_locked_and_distinct_owner_token() -> None:
  engine = Engine()
  repository = SqlAnalysisRepository(engine)

  async def claim_twice():
    return await asyncio.gather(
      repository.claim("11111111-1111-1111-1111-111111111111"),
      repository.claim("22222222-2222-2222-2222-222222222222")
    )

  first, second = asyncio.run(claim_twice())

  assert [item for item in (first, second) if item] == [first or second]
  assert engine.connection.owners == ["11111111-1111-1111-1111-111111111111"]
