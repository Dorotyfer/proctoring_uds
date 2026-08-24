"""FastAPI application factory."""

from typing import Annotated, Protocol, cast
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
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
  readiness_service: HealthService | None = None,
  session_service: SessionService | None = None,
  event_service: EventService | None = None,
  jwt_secret: str | None = None,
  moodle_integration_key: str | None = None,
  web_origin: str | None = None
) -> FastAPI:
  """Build an HTTP-only application without loading runtime configuration or models."""

  app = FastAPI()
  app.state.health_service = health_service
  app.state.readiness_service = readiness_service
  if web_origin:
    app.add_middleware(CORSMiddleware, allow_origins=[web_origin], allow_credentials=True,
      allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Authorization", "Content-Type"])

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

  @app.get("/health/ready")
  async def ready(request: Request) -> dict[str, str]:
    service = request.app.state.readiness_service
    if service is None:
      return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content={
        "status": "degraded", "database": "unavailable", "storage": "unavailable", "queue": "unavailable"
      })
    statuses = await service.check()
    response = {"status": "ok" if all(value == "available" for value in statuses.values()) else "degraded", **statuses}
    return JSONResponse(status_code=200 if response["status"] == "ok" else 503, content=response)

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
    request: Request,
    _: Annotated[None, Depends(moodle_auth)]
  ) -> dict:
    try:
      payload = await _object_json(request)
      session = await session_service.create(CreateSessionInput.model_validate(payload))
    except ValidationError as error:
      return JSONResponse(status_code=400, content={
        "error": "Invalid session payload", "details": _zod_issues(error, payload)
      })
    except ValueError:
      return JSONResponse(status_code=400, content={"error": "Invalid session payload"})
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
      "status": session.status.value, "expiresAt": session.expires_at,
      "biometric": {"enrollmentVersion": None, "state": "unregistered"}}}

  @app.post("/v1/sessions/{session_id}/events", status_code=status.HTTP_201_CREATED)
  async def record_event(
    session_id: str,
    request: Request,
    claims: Annotated[dict, Depends(browser_auth)]
  ) -> dict:
    parsed_id = _require_browser_ownership(session_id, claims)
    try:
      payload = await _object_json(request)
      return await event_service.record(parsed_id, payload)
    except SessionUnavailableError:
      return JSONResponse(status_code=409, content={"error": "Session is not active"})
    except (ValidationError, ValueError):
      return JSONResponse(status_code=400, content={"error": "Invalid event payload"})
    except EventRateLimitError:
      return JSONResponse(status_code=429, content={"error": "Event rate limit exceeded"})


def _parse_session_id(value: str) -> UUID:
  try:
    parsed = UUID(value)
  except ValueError as error:
    raise HTTPException(status_code=400, detail="Invalid session identifier") from error
  if str(parsed).lower() != value.lower():
    raise HTTPException(status_code=400, detail="Invalid session identifier")
  return parsed


def _require_browser_ownership(session_id: str, claims: dict) -> UUID:
  parsed_id = _parse_session_id(session_id)
  if claims.get("sessionId") != str(parsed_id):
    raise HTTPException(status_code=403, detail="Token does not belong to this session")
  return parsed_id


async def _object_json(request: Request) -> dict:
  try:
    payload = await request.json()
  except ValueError as error:
    raise ValueError("Request body must be JSON") from error
  if not isinstance(payload, dict):
    raise ValueError("Request body must be an object")
  return payload


def _zod_issues(error: ValidationError, payload: dict) -> list[dict]:
  """Translate the supported session-contract errors to the established Zod wire form."""

  issues = []
  for issue in error.errors():
    path = list(issue["loc"])
    field = path[0] if path else None
    value = payload.get(field) if field else None
    if issue["type"] == "missing":
      issues.append({"code": "invalid_type", "expected": "string", "received": "undefined",
        "path": path, "message": "Required"})
    elif field == "deviceMode" and not isinstance(value, str):
      received = _zod_received_type(value)
      issues.append({"code": "invalid_type", "expected": "'browser' | 'seb'", "received": received,
        "path": path, "message": f"Expected 'browser' | 'seb', received {received}"})
    elif field == "deviceMode" and issue["type"] == "enum":
      issues.append({"code": "invalid_enum_value", "options": ["browser", "seb"], "received": value,
        "path": path, "message": f"Invalid enum value. Expected 'browser' | 'seb', received '{value}'"})
    elif field in {"issuedAt", "expiresAt"} and not isinstance(value, str):
      received = _zod_received_type(value)
      issues.append({"code": "invalid_type", "expected": "string", "received": received,
        "path": path, "message": f"Expected string, received {received}"})
    elif field in {"issuedAt", "expiresAt"} and isinstance(value, str):
      issues.append({"code": "invalid_string", "validation": "datetime", "path": path,
        "message": "Invalid datetime"})
    elif issue["type"] == "string_too_short":
      issues.append({"code": "too_small", "minimum": 1, "type": "string", "inclusive": True,
        "exact": False, "message": "String must contain at least 1 character(s)", "path": path})
    elif issue["type"] == "string_too_long":
      issues.append({"code": "too_big", "maximum": issue["ctx"]["max_length"], "type": "string",
        "inclusive": True, "exact": False,
        "message": f"String must contain at most {issue['ctx']['max_length']} character(s)", "path": path})
    elif issue["type"] == "string_type":
      received = _zod_received_type(value)
      issues.append({"code": "invalid_type", "expected": "string", "received": received,
        "path": path, "message": f"Expected string, received {received}"})
    elif not path and "expiresAt must be later than issuedAt" in issue["msg"]:
      issues.append({"code": "custom", "path": ["expiresAt"],
        "message": "expiresAt must be later than issuedAt"})
    else:
      issues.append({"code": "custom", "path": path, "message": issue["msg"]})
  return issues


def _zod_received_type(value: object) -> str:
  if value is None:
    return "null"
  if isinstance(value, bool):
    return "boolean"
  if isinstance(value, (int, float)):
    return "number"
  if isinstance(value, list):
    return "array"
  if isinstance(value, dict):
    return "object"
  return type(value).__name__
