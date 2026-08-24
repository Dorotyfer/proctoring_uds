import asyncio
from datetime import UTC, datetime

import pytest

from proctoring.pilot import LoadResponse, create_pilot_fixtures, run_load_scenario


def test_fixture_payload_defaults_to_block_and_contains_no_real_personal_data() -> None:
  fixtures = create_pilot_fixtures(2, issued_at=datetime(2026, 8, 24, 12, 0, tzinfo=UTC), seed="Acceptance 01")

  assert fixtures[0]["failurePolicy"] == "block"
  assert fixtures[0]["moodleAttemptId"] == "pilot-acceptance-01-attempt-0001"
  assert fixtures[1]["deviceMode"] == "seb"


@pytest.mark.parametrize("count", [0, 1001])
def test_fixture_count_is_bounded(count: int) -> None:
  with pytest.raises(ValueError):
    create_pilot_fixtures(count, issued_at=datetime.now(UTC))


def test_load_scenario_retries_bounded_failures_and_reports_percentiles() -> None:
  attempts = 0

  async def operation(item):
    nonlocal attempts
    attempts += 1
    if attempts == 1:
      raise RuntimeError("api_503")
    return LoadResponse(201, 100)

  report = asyncio.run(run_load_scenario(
    [{"id": 1}], operation, concurrency=1, max_retries=1
  ))

  assert report["completed"] == 1
  assert report["failed"] == 0
  assert report["retries"] == 1
  assert report["responseBytes"] == 100
