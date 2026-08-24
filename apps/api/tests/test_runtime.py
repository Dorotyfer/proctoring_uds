from fastapi.testclient import TestClient

from proctoring_api.config import Settings
from proctoring_api.main import create_runtime_app
from proctoring_api.db.engine import create_mariadb_engine


def environment() -> dict[str, str]:
  return {
    "API_PUBLIC_URL": "https://api.proctoring.example.edu/api", "BIOMETRIC_ENCRYPTION_KEY": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "DATABASE_URL": "mysql://service:password@127.0.0.1:3306/proctoring", "EVIDENCE_ENCRYPTION_KEY": "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
    "JWT_SECRET": "browser-token-secret-with-32-characters", "MOODLE_INTEGRATION_KEY": "moodle-integration-key-with-32-characters",
    "PANEL_SSO_SECRET": "panel-sso-secret-with-at-least-32-characters", "S3_ACCESS_KEY_ID": "access-key", "S3_BUCKET": "evidence",
    "S3_ENDPOINT": "https://s3.example.edu", "S3_REGION": "us-east-1", "S3_SECRET_ACCESS_KEY": "secret-key", "WEB_ORIGIN": "https://proctoring.example.edu"
  }


class Engine:
  def __init__(self) -> None:
    self.disposed = False

  async def dispose(self) -> None:
    self.disposed = True


class Storage:
  def __init__(self) -> None:
    self.closed = False

  async def check(self) -> None:
    raise RuntimeError("not connected in construction test")

  async def close(self) -> None:
    self.closed = True


def test_runtime_factory_composes_services_without_connecting_until_health_and_disposes_engine() -> None:
  engine = Engine()
  storage = Storage()
  app = create_runtime_app(
    Settings.from_environment(environment()), engine_factory=lambda _: engine, storage_factory=lambda _: storage
  )

  with TestClient(app) as client:
    response = client.get("/health")

  assert response.status_code == 503
  assert engine.disposed is True
  assert storage.closed is True


def test_runtime_factory_exposes_evidence_service_without_connecting_to_storage() -> None:
  engine = Engine()
  app = create_runtime_app(Settings.from_environment(environment()), engine_factory=lambda _: engine)

  assert app.state.evidence_service is not None
  assert app.state.evidence_repository is not None
  assert app.state.object_storage is not None
  assert engine.disposed is False


def test_mariadb_engine_configures_utc_for_each_new_connection(monkeypatch) -> None:
  captured = {}

  def fake_create_async_engine(url, **kwargs):
    captured["url"] = url
    captured["kwargs"] = kwargs
    return object()
  monkeypatch.setattr("proctoring_api.db.engine.create_async_engine", fake_create_async_engine)

  create_mariadb_engine("mysql://service:password@database.example.edu/proctoring")

  assert captured["url"] == "mysql+asyncmy://service:password@database.example.edu/proctoring"
  assert captured["kwargs"]["connect_args"]["init_command"] == "SET time_zone = '+00:00'"
