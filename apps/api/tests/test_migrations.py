import asyncio
from pathlib import Path

import pytest

from proctoring_api.db.migrations import MigrationLockError, MigrationRunner, migration_files, split_sql_statements


def test_migration_files_preserve_all_existing_numbered_migrations() -> None:
  files = migration_files()
  assert [path.name for path in files] == [f"{number:03d}_{name}.sql" for number, name in [
    (1, "sessions"), (2, "events"), (3, "preparation_alerts"), (4, "evidence_panel"), (5, "panel_course_catalog"), (6, "incident_evidence"), (7, "biometric_profiles"), (8, "session_failure_policy"), (9, "analysis_queue"), (10, "worker_monitoring_state")
  ]]
  assert "CREATE TABLE IF NOT EXISTS proctoring_sessions" in files[0].read_text(encoding="utf-8")
  worker_migration = files[-1].read_text(encoding="utf-8")
  assert "CREATE TABLE IF NOT EXISTS proctoring_sface_audit" in worker_migration
  assert "REFERENCES proctoring_sface_profiles" in worker_migration


def test_raw_sql_splitter_preserves_semicolons_inside_string_literals() -> None:
  assert split_sql_statements("INSERT INTO x VALUES ('a;b'); CREATE TABLE y (id INT);") == [
    "INSERT INTO x VALUES ('a;b')", "CREATE TABLE y (id INT)"
  ]


class Result:
  def __init__(self, row=None): self.row = row
  def mappings(self): return self
  def first(self): return self.row


class Connection:
  def __init__(self):
    self.executed = []
    self.applied = set()
    self.commit_count = 0

  async def commit(self):
    self.commit_count += 1

  async def execute(self, statement, parameters=None):
    text = str(statement)
    self.executed.append((text, parameters))
    if "GET_LOCK" in text:
      return Result({"acquired": 1})
    if "SELECT 1 FROM proctoring_schema_migrations" in text:
      return Result((1,) if parameters["name"] in self.applied else None)
    if "INSERT INTO proctoring_schema_migrations" in text:
      self.applied.add(parameters["name"])
    return Result()


def test_migration_runner_applies_raw_sql_once_and_skips_previously_recorded_files(tmp_path: Path) -> None:
  migration = tmp_path / "001_example.sql"
  migration.write_text("CREATE TABLE IF NOT EXISTS example (id INT);", encoding="utf-8")
  connection = Connection()
  runner = MigrationRunner(connection, migrations_path=tmp_path)

  assert asyncio.run(runner.apply()) == ["001_example.sql"]
  assert asyncio.run(runner.apply()) == []
  assert any("CREATE TABLE IF NOT EXISTS example" in text for text, _ in connection.executed)
  assert any("RELEASE_LOCK" in text for text, _ in connection.executed)
  assert connection.commit_count == 1


def test_migration_runner_releases_lock_without_recording_failed_ddl(tmp_path: Path) -> None:
  migration = tmp_path / "001_broken.sql"
  migration.write_text("BROKEN DDL;", encoding="utf-8")
  connection = Connection()
  original_execute = connection.execute

  async def execute(statement, parameters=None):
    if "BROKEN DDL" in str(statement):
      raise RuntimeError("DDL failed")
    return await original_execute(statement, parameters)
  connection.execute = execute

  with pytest.raises(RuntimeError, match="DDL failed"):
    asyncio.run(MigrationRunner(connection, migrations_path=tmp_path).apply())
  assert "001_broken.sql" not in connection.applied
  assert any("RELEASE_LOCK" in text for text, _ in connection.executed)


def test_migration_runner_fails_when_advisory_lock_is_unavailable(tmp_path: Path) -> None:
  connection = Connection()
  original_execute = connection.execute

  async def execute(statement, parameters=None):
    if "GET_LOCK" in str(statement):
      return Result({"acquired": 0})
    return await original_execute(statement, parameters)
  connection.execute = execute

  with pytest.raises(MigrationLockError):
    asyncio.run(MigrationRunner(connection, migrations_path=tmp_path).apply())
