"""FastAPI application factory."""

from typing import Annotated, Protocol, cast
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from proctoring_api.auth import (
  issue_browser_token,
  require_browser_claims,
  require_integration_key
)
from proctoring_api.services.events import (
  EventRateLimitError,
  EventService,
  EventTimestampError,
  SessionUnavailableError
)
from proctoring_api.services.sessions import SessionService
from proctoring_api.models import CreateSessionInput


class HealthService(Protocol):
  """Dependency that checks database reachability."""

  async def check(self) -> None:
    """Raise when the database is not reachable."""


def create_app(
  health_service: HealthService,
  *,
  session_service: SessionService | None = None,
  event_service: EventService | None = None,
  jwt_secret: str | None = None,
  moodle_integration_key: str | None = None
) -> FastAPI:
  """Build an HTTP-only application without loading runtime configuration or models."""

  app = FastAPI()
  app.state.health_service = health_service

  @app.exception_handler(HTTPException)
  async def http_exception(_: Request, error: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=error.status_code, content={"error": error.detail})

  @app.exception_handler(RequestValidationError)
  async def invalid_request(_: Request, __: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"error": "Invalid request"})

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

  if session_service and event_service and jwt_secret and moodle_integration_key:
    _register_task_two_routes(
      app, session_service, event_service, jwt_secret, moodle_integration_key
    )
  return app


def _health_service_from_request(request: Request) -> HealthService:
  return cast(HealthService, request.app.state.health_service)


def _register_task_two_routes(
  app: FastAPI,
  session_service: SessionService,
  event_service: EventService,
  jwt_secret: str,
  moodle_integration_key: str
) -> None:
  moodle_auth = require_integration_key(moodle_integration_key)
  browser_auth = require_browser_claims(jwt_secret)

  @app.post("/v1/internal/sessions", status_code=status.HTTP_201_CREATED)
  async def create_session(
    payload: dict,
    _: Annotated[None, Depends(moodle_auth)]
  ) -> dict:
    try:
      session = await session_service.create(CreateSessionInput.model_validate(payload))
    except ValidationError as error:
      return JSONResponse(status_code=400, content={
        "error": "Invalid session payload", "details": error.errors()
      })
    return {"session": session.model_dump(mode="json", by_alias=True)}

  @app.post("/v1/internal/sessions/{session_id}/browser-token")
  async def issue_token(session_id: str, _: Annotated[None, Depends(moodle_auth)]) -> dict:
    parsed_id = _parse_session_id(session_id)
    session = await session_service.get_active(parsed_id)
    if not session:
      raise HTTPException(status_code=404, detail="Active session not found")
    return {"browserToken": issue_browser_token(
      str(session.id), session.moodle_attempt_id, session.device_mode.value, jwt_secret
    )}

  @app.post("/v1/internal/sessions/{session_id}/status")
  async def get_status(session_id: str, _: Annotated[None, Depends(moodle_auth)]) -> dict:
    session = await session_service.get(_parse_session_id(session_id))
    if not session:
      raise HTTPException(status_code=404, detail="Session not found")
    return {"session": {"id": str(session.id), "status": session.status.value}}

  @app.post("/v1/internal/sessions/{session_id}/complete")
  async def complete_session(session_id: str, _: Annotated[None, Depends(moodle_auth)]) -> dict:
    session = await session_service.complete(_parse_session_id(session_id))
    if not session:
      raise HTTPException(status_code=404, detail="Session not found")
    return {"session": session.model_dump(mode="json", by_alias=True)}

  @app.get("/v1/sessions/{session_id}")
  async def browser_session(
    session_id: str,
    claims: Annotated[dict, Depends(browser_auth)]
  ) -> dict:
    parsed_id = _require_browser_ownership(session_id, claims)
    session = await session_service.get_active(parsed_id)
    if not session:
      raise HTTPException(status_code=404, detail="Active session not found")
    return {"session": {"id": str(session.id), "deviceMode": session.device_mode.value,
      "status": session.status.value, "expiresAt": session.expires_at}}

  @app.post("/v1/sessions/{session_id}/events", status_code=status.HTTP_201_CREATED)
  async def record_event(
    session_id: str,
    payload: dict,
    claims: Annotated[dict, Depends(browser_auth)]
  ) -> dict:
    parsed_id = _require_browser_ownership(session_id, claims)
    try:
      return await event_service.record(parsed_id, payload)
    except (ValidationError, EventTimestampError):
      return JSONResponse(status_code=400, content={"error": "Invalid event payload"})
    except SessionUnavailableError:
      return JSONResponse(status_code=409, content={"error": "Session is not active"})
    except EventRateLimitError:
      return JSONResponse(status_code=429, content={"error": "Event rate limit exceeded"})


def _parse_session_id(value: str) -> UUID:
  try:
    return UUID(value)
  except ValueError as error:
    raise HTTPException(status_code=400, detail="Invalid session identifier") from error


def _require_browser_ownership(session_id: str, claims: dict) -> UUID:
  parsed_id = _parse_session_id(session_id)
  if claims.get("sessionId") != str(parsed_id):
    raise HTTPException(status_code=403, detail="Token does not belong to this session")
  return parsed_id
