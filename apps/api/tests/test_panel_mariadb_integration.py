"""Opt-in MariaDB smoke test for panel repository queries."""

import asyncio
import os

import pytest

from proctoring.db.engine import create_mariadb_engine
from proctoring.repositories.panel import SqlPanelRepository


@pytest.mark.integration
@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="requires TEST_DATABASE_URL")
def test_panel_repository_runs_an_authorized_empty_scope_query_against_mariadb() -> None:
  async def check() -> None:
    engine = create_mariadb_engine(os.environ["TEST_DATABASE_URL"])
    try:
      result = await SqlPanelRepository(engine).list_courses(
        {"courseIds": ["__panel_scope_smoke__"], "institutional": False},
        {"query": "", "page": 1, "pageSize": 1}
      )
      assert result["page"] == 1 and result["pageSize"] == 1
    finally:
      await engine.dispose()

  asyncio.run(check())
