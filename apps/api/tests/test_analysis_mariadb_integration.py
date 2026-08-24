"""Opt-in MariaDB claim syntax coverage for the durable worker queue."""

import asyncio
import os
from uuid import uuid4

import pytest

from proctoring_api.db.engine import create_mariadb_engine
from proctoring_api.repositories.analysis import SqlAnalysisRepository


@pytest.mark.integration
@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="requires TEST_DATABASE_URL")
def test_analysis_repository_claim_runs_skip_locked_query_against_mariadb() -> None:
  async def check() -> None:
    engine = create_mariadb_engine(os.environ["TEST_DATABASE_URL"])
    try:
      assert await SqlAnalysisRepository(engine).claim(str(uuid4())) is None
    finally:
      await engine.dispose()

  asyncio.run(check())
