"""FastAPI application factory."""

from typing import Annotated, Protocol, cast

from fastapi import Depends, FastAPI, Request, status
from fastapi.responses import JSONResponse


class HealthService(Protocol):
  """Dependency that checks database reachability."""

  async def check(self) -> None:
    """Raise when the database is not reachable."""


def create_app(health_service: HealthService) -> FastAPI:
  """Build an HTTP-only application without loading runtime configuration or models."""

  app = FastAPI()
  app.state.health_service = health_service

  @app.get("/health")
  async def health(
    service: Annotated[HealthService, Depends(_health_service_from_request)]
  ) -> dict[str, str]:
    try:
      await service.check()
    except Exception:
      return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"status": "degraded", "database": "unavailable"}
      )
    return {"status": "ok", "database": "available"}

  return app


def _health_service_from_request(request: Request) -> HealthService:
  return cast(HealthService, request.app.state.health_service)
