"""Raw SQL migration runner for the historical MariaDB schema."""

import argparse
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from proctoring_api.config import Settings
from proctoring_api.db.engine import create_mariadb_engine


def migration_files(migrations_path: Path | None = None) -> list[Path]:
  directory = migrations_path or Path(__file__).parents[3] / "src" / "db" / "migrations"
  return sorted(directory.glob("[0-9][0-9][0-9]_*.sql"))


def split_sql_statements(sql: str) -> list[str]:
  """Split ordinary migration SQL without treating quoted semicolons as delimiters."""

  statements: list[str] = []
  current: list[str] = []
  quote: str | None = None
  escaped = False
  for character in sql:
    if quote:
      current.append(character)
      if escaped:
        escaped = False
      elif character == "\\":
        escaped = True
      elif character == quote:
        quote = None
      continue
    if character in {"'", '"'}:
      quote = character
      current.append(character)
    elif character == ";":
      statement = "".join(current).strip()
      if statement:
        statements.append(statement)
      current = []
    else:
      current.append(character)
  statement = "".join(current).strip()
  if statement:
    statements.append(statement)
  return statements


class MigrationRunner:
  """Serialize DDL and record a migration only after every statement succeeds."""

  def __init__(self, connection: AsyncConnection, migrations_path: Path | None = None) -> None:
    self._connection = connection
    self._migrations_path = migrations_path

  async def apply(self) -> list[str]:
    acquired = await self._connection.execute(text("""
      SELECT GET_LOCK(:name, :timeout) AS acquired
    """), {"name": "proctoring_schema_migrations", "timeout": 30})
    lock = acquired.mappings().first()
    if not lock or not lock["acquired"]:
      raise MigrationLockError("Could not acquire proctoring migration lock")
    try:
      await self._connection.execute(text("""
        CREATE TABLE IF NOT EXISTS proctoring_schema_migrations (
          name VARCHAR(255) PRIMARY KEY,
          applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      """))
      applied = []
      for path in migration_files(self._migrations_path):
        existing = await self._connection.execute(text("""
          SELECT 1 FROM proctoring_schema_migrations WHERE name = :name
        """), {"name": path.name})
        if existing.first():
          continue
        for statement in split_sql_statements(path.read_text(encoding="utf-8")):
          await self._connection.execute(text(statement))
        await self._ensure_legacy_foreign_keys(path.name)
        await self._connection.execute(text("""
          INSERT INTO proctoring_schema_migrations (name) VALUES (:name)
        """), {"name": path.name})
        await self._connection.commit()
        applied.append(path.name)
      return applied
    finally:
      await self._connection.execute(text("SELECT RELEASE_LOCK(:name)"), {
        "name": "proctoring_schema_migrations"
      })

  async def _ensure_legacy_foreign_keys(self, filename: str) -> None:
    constraints = {
      "004_evidence_panel.sql": (
        "proctoring_sessions", "proctoring_sessions_reference_evidence_fk",
        "ALTER TABLE proctoring_sessions ADD CONSTRAINT proctoring_sessions_reference_evidence_fk "
        "FOREIGN KEY (reference_evidence_id) REFERENCES proctoring_evidence(id)"
      ),
      "006_incident_evidence.sql": (
        "proctoring_evidence", "proctoring_evidence_event_fk",
        "ALTER TABLE proctoring_evidence ADD CONSTRAINT proctoring_evidence_event_fk "
        "FOREIGN KEY (event_id) REFERENCES proctoring_events(id)"
      )
    }
    entry = constraints.get(filename)
    if not entry:
      return
    table, name, statement = entry
    result = await self._connection.execute(text("""
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE() AND table_name = :table AND constraint_name = :name
    """), {"table": table, "name": name})
    if not result.first():
      await self._connection.execute(text(statement))


class MigrationLockError(RuntimeError):
  """Raised when another migration runner holds the MariaDB advisory lock."""


async def run_cli() -> None:
  settings = Settings.from_process_environment()
  engine = create_mariadb_engine(settings.database_url)
  async with engine.connect() as connection:
    for name in await MigrationRunner(connection).apply():
      print(f"Applied migration: {name}")
  await engine.dispose()


def main() -> None:
  parser = argparse.ArgumentParser(description="Apply proctoring MariaDB migrations")
  parser.parse_args()
  import asyncio
  asyncio.run(run_cli())


if __name__ == "__main__":
  main()
