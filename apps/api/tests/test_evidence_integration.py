"""Opt-in smoke checks for the configured MariaDB and S3/MinIO test services."""

import asyncio
import os

import pytest

from proctoring_api.db.engine import create_mariadb_engine
from proctoring_api.repositories.sessions import SqlSessionRepository
from proctoring_api.services.object_storage import S3ObjectStorage


REQUIRED_INTEGRATION_SETTINGS = (
  "TEST_DATABASE_URL", "TEST_S3_ENDPOINT", "TEST_S3_BUCKET",
  "TEST_S3_ACCESS_KEY_ID", "TEST_S3_SECRET_ACCESS_KEY"
)


@pytest.mark.integration
@pytest.mark.skipif(
  not all(os.environ.get(name) for name in REQUIRED_INTEGRATION_SETTINGS),
  reason="requires TEST_DATABASE_URL and TEST_S3_* settings"
)
def test_configured_database_and_s3_are_reachable() -> None:
  async def check() -> None:
    engine = create_mariadb_engine(os.environ["TEST_DATABASE_URL"])
    storage = S3ObjectStorage(
      os.environ["TEST_S3_BUCKET"], endpoint_url=os.environ["TEST_S3_ENDPOINT"],
      region_name=os.environ.get("TEST_S3_REGION", "us-east-1"),
      access_key_id=os.environ["TEST_S3_ACCESS_KEY_ID"],
      secret_access_key=os.environ["TEST_S3_SECRET_ACCESS_KEY"],
      force_path_style=os.environ.get("TEST_S3_FORCE_PATH_STYLE", "false").lower() == "true"
    )
    try:
      await SqlSessionRepository(engine).ping()
      await storage.check()
    finally:
      await engine.dispose()

  asyncio.run(check())
