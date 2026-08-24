from fastapi.testclient import TestClient

from proctoring.app import create_app


class AvailableHealthService:
  async def check(self) -> None:
    return None


class UnavailableHealthService:
  async def check(self) -> None:
    raise RuntimeError("database connection failed")


def test_health_reports_an_available_database() -> None:
  client = TestClient(create_app(AvailableHealthService()))

  response = client.get("/health")

  assert response.status_code == 200
  assert response.json() == {"status": "ok", "database": "available"}


def test_health_hides_database_failures() -> None:
  client = TestClient(create_app(UnavailableHealthService()))

  response = client.get("/health")

  assert response.status_code == 503
  assert response.json() == {"status": "degraded", "database": "unavailable"}
