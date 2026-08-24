import asyncio
from pathlib import Path

from proctoring_api.db.migrations import MigrationRunner, migration_files, split_sql_statements


def test_migration_files_preserve_all_existing_numbered_migrations() -> None:
  files = migration_files()
  assert [path.name for path in files] == [f"{number:03d}_{name}.sql" for number, name in [
    (1, "sessions"), (2, "events"), (3, "preparation_alerts"), (4, "evidence_panel"), (5, "panel_course_catalog"), (6, "incident_evidence"), (7, "biometric_profiles")
  ]]
  assert "CREATE TABLE IF NOT EXISTS proctoring_sessions" in files[0].read_text(encoding="utf-8")


def test_raw_sql_splitter_preserves_semicolons_inside_string_literals() -> None:
  assert split_sql_statements("INSERT INTO x VALUES ('a;b'); CREATE TABLE y (id INT);") == [
    "INSERT INTO x VALUES ('a;b')", "CREATE TABLE y (id INT)"
  ]


class Result:
  def __init__(self, row=None): self.row = row
  def first(self): return self.row


class Transaction:
  def __init__(self, connection): self.connection = connection
  async def __aenter__(self): return self.connection
  async def __aexit__(self, *_): return None


class Connection:
  def __init__(self):
    self.executed = []
    self.applied = set()

  def begin(self): return Transaction(self)

  async def execute(self, statement, parameters=None):
    text = str(statement)
    self.executed.append((text, parameters))
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
