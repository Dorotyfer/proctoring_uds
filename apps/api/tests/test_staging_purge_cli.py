from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from proctoring_api import cli


class FakeAnalysisRepository:
  async def referenced_staging_keys(self, keys: list[str]) -> set[str]:
    return {key for key in keys if key.endswith("referenced.jpg")}


class FakeObjectStorage:
  def __init__(self, now: datetime) -> None:
    self.deleted: list[str] = []
    self.objects = [
      {"key": "staging/orphan.jpg", "lastModified": now - timedelta(hours=2)},
      {"key": "staging/referenced.jpg", "lastModified": now - timedelta(hours=2)},
      {"key": "staging/recent.jpg", "lastModified": now},
    ]

  async def list_prefix(self, prefix: str) -> list[dict]:
    assert prefix == "staging/"
    return self.objects

  async def delete(self, key: str) -> None:
    self.deleted.append(key)


class FakeDependencies:
  def __init__(self, now: datetime) -> None:
    self.analyses = FakeAnalysisRepository()
    self.object_storage = FakeObjectStorage(now)
    self.closed = False

  async def close(self) -> None:
    self.closed = True


@pytest.mark.anyio
async def test_purge_staging_deletes_only_expired_unreferenced_objects(monkeypatch: pytest.MonkeyPatch) -> None:
  now = datetime.now(UTC)
  dependencies = FakeDependencies(now)
  settings = SimpleNamespace(
    staging_retention_minutes=30,
    evidence_encryption_key_bytes=b"0" * 32,
  )
  monkeypatch.setattr(cli.Settings, "from_process_environment", lambda: settings)
  monkeypatch.setattr(cli, "create_runtime_dependencies", lambda configured: dependencies)

  deleted = await cli.purge_staging()

  assert deleted == 1
  assert dependencies.object_storage.deleted == ["staging/orphan.jpg"]
  assert dependencies.closed is True


def test_purge_staging_main_exits_nonzero_without_exposing_exception(monkeypatch: pytest.MonkeyPatch, capsys) -> None:
  async def unavailable() -> int:
    raise RuntimeError("secret endpoint and object key")

  monkeypatch.setattr(cli, "purge_staging", unavailable)

  with pytest.raises(SystemExit) as raised:
    cli.purge_staging_main()

  assert raised.value.code == 1
  assert capsys.readouterr().out.strip() == "Staging purge unavailable"
