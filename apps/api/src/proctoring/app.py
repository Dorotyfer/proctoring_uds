"""FastAPI application factory."""

from typing import Annotated, Protocol, cast
from uuid import UUID

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError


class UploadBodyLimitMiddleware:
  """Pure ASGI guard that runs before Starlette's multipart parser."""
  def __init__(self, app, preparation_limit: int = 3 * 200 * 1024 + 16 * 1024, monitoring_limit: int = 200 * 1024 + 8 * 1024):
    self.app, self.preparation_limit, self.monitoring_limit = app, preparation_limit, monitoring_limit
  async def __call__(self, scope, receive, send):
    path = scope.get("path", "")
    limit = self.preparation_limit if path.endswith("/preparation-analyses") else self.monitoring_limit if path.endswith("/monitoring-frames") else None
    if scope.get("type") != "http" or scope.get("method") != "POST" or limit is None:
      return await self.app(scope, receive, send)
    headers = dict(scope.get("headers", []))
    try: known = int(headers.get(b"content-length", b"0"))
    except ValueError: known = 0
    if known > limit: return await _payload_too_large(send)
    consumed = 0
    async def bounded_receive():
      nonlocal consumed
      message = await receive()
      if message.get("type") == "http.request":
        consumed += len(message.get("body", b""))
        if consumed > limit: return {"type": "http.disconnect"}
      return message
    return await self.app(scope, bounded_receive, send)


async def _payload_too_large(send):
  await send({"type": "http.response.start", "status": 413, "headers": [(b"content-type", b"application/json")]})
  await send({"type": "http.response.body", "body": b'{"error":"Upload too large"}'})

from proctoring.auth import (
  issue_browser_token,
  require_browser_claims,
  require_integration_key
)
from proctoring.services.events import (
  EventRateLimitError,
  EventService,
  SessionUnavailableError
)
from proctoring.services.sessions import SessionService
from proctoring.models import CreateSessionInput
from proctoring.config import canonical_http_origin


class HealthService(Protocol):
  """Dependency that checks database reachability."""

  async def check(self) -> None:
    """Raise when the database is not reachable."""


def create_app(
  health_service: HealthService,
  *,
  readiness_service: HealthService | None = None,
  evidence_service: object | None = None,
  evidence_repository: object | None = None,
  object_storage: object | None = None,
  session_service: SessionService | None = None,
  event_service: EventService | None = None,
  jwt_secret: str | None = None,
  moodle_integration_key: str | None = None,
  web_origin: str | None = None,
  panel_repository: object | None = None,
  biometric_profile_repository: object | None = None,
  panel_sso_secret: str | None = None,
  api_public_url: str | None = None,
  analysis_service: object | None = None,
  moodle_origin: str | None = None,
  web_public_base_path: str = "/proctoring"
) -> FastAPI:
  """Build an HTTP-only application without loading runtime configuration or models."""

  app = FastAPI()
  app.add_middleware(UploadBodyLimitMiddleware)
  app.state.health_service = health_service
  app.state.readiness_service = readiness_service
  # Task 4 consumes these for panel evidence routes; Task 5 consumes them for
  # server-generated monitoring captures. This task intentionally adds no HTTP route.
  app.state.evidence_service = evidence_service
  app.state.evidence_repository = evidence_repository
  app.state.object_storage = object_storage
  app.state.analysis_service = analysis_service
  canonical_web_origin = canonical_http_origin(web_origin) if web_origin else None
  if canonical_web_origin:
    app.add_middleware(CORSMiddleware, allow_origins=[canonical_web_origin], allow_credentials=True,
      allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"])

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
  if panel_repository and evidence_service and jwt_secret and panel_sso_secret and canonical_web_origin and api_public_url:
    from proctoring.panel_routes import register_panel_routes
    app.include_router(register_panel_routes(panel_repository, evidence_service, biometric_profile_repository,
      jwt_secret=jwt_secret, panel_sso_secret=panel_sso_secret, web_origin=canonical_web_origin,
      api_public_url=api_public_url))
  if analysis_service and jwt_secret and session_service:
    _register_analysis_routes(app, analysis_service, session_service, jwt_secret)
  if api_public_url:
    from proctoring.web import register_web_ui
    register_web_ui(
      app,
      api_public_url=api_public_url,
      moodle_origin=moodle_origin,
      public_base_path=web_public_base_path
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


def _register_analysis_routes(app: FastAPI, analysis_service: object, session_service: SessionService, jwt_secret: str) -> None:
  """Browser-only staged analysis API. Images are consumed immediately and never logged."""

  from proctoring.services.analysis import AnalysisCapacityError, ChallengeExpiredError, ConsentRequiredError, ImageValidationError, read_bounded_upload

  browser_auth = require_browser_claims(jwt_secret)

  async def active(session_id: str, claims: dict) -> UUID | JSONResponse:
    parsed_id = _require_browser_ownership(session_id, claims)
    if not await session_service.get_active(parsed_id):
      return JSONResponse(status_code=409, content={"error": "Session is not active"})
    return parsed_id

  @app.post("/v1/sessions/{session_id}/liveness-challenges", status_code=status.HTTP_201_CREATED)
  async def liveness_challenge(session_id: str, claims: Annotated[dict, Depends(browser_auth)]) -> dict:
    parsed_id = await active(session_id, claims)
    if isinstance(parsed_id, JSONResponse): return parsed_id
    challenge = await analysis_service.issue_challenge(str(parsed_id))
    return {"challenge": challenge}

  @app.post("/v1/sessions/{session_id}/preparation-analyses", status_code=status.HTTP_202_ACCEPTED)
  async def preparation_analysis(
    session_id: str,
    analysis_id: Annotated[str, Form(alias="analysisId")],
    consent_accepted: Annotated[str, Form(alias="consentAccepted")],
    challenge_id: Annotated[str, Form(alias="challengeId")],
    center_start: Annotated[UploadFile, File(alias="centerStart")],
    turn: Annotated[UploadFile, File()],
    center_end: Annotated[UploadFile, File(alias="centerEnd")],
    claims: Annotated[dict, Depends(browser_auth)]
  ) -> dict:
    parsed_id = await active(session_id, claims)
    if isinstance(parsed_id, JSONResponse): return parsed_id
    _parse_analysis_id(analysis_id)
    if consent_accepted != "true":
      return JSONResponse(status_code=400, content={"error": "Consent is required"})
    try:
      files = [center_start, turn, center_end]
      frames = [await read_bounded_upload(file) for file in files]
      analysis = await analysis_service.enqueue_preparation(str(parsed_id), analysis_id, True, challenge_id, frames,
        [file.content_type for file in files])
      return {"analysis": analysis}
    except ChallengeExpiredError:
      return JSONResponse(status_code=409, content={"error": "Challenge is used or expired"})
    except ConsentRequiredError:
      return JSONResponse(status_code=400, content={"error": "Consent is required"})
    except ImageValidationError:
      return JSONResponse(status_code=400, content={"error": "Invalid JPEG upload"})
    except AnalysisCapacityError as error:
      return JSONResponse(status_code=429, content={"error": "Analysis queue is saturated"}, headers={"Retry-After": str(int(error.retry_after_seconds))})

  @app.post("/v1/sessions/{session_id}/monitoring-frames", status_code=status.HTTP_202_ACCEPTED)
  async def monitoring_frame(
    session_id: str,
    analysis_id: Annotated[str, Form(alias="analysisId")],
    frame: Annotated[UploadFile, File()],
    claims: Annotated[dict, Depends(browser_auth)]
  ) -> dict:
    parsed_id = await active(session_id, claims)
    if isinstance(parsed_id, JSONResponse): return parsed_id
    _parse_analysis_id(analysis_id)
    try:
      analysis = await analysis_service.enqueue_monitoring(str(parsed_id), analysis_id, await read_bounded_upload(frame), frame.content_type)
      return {"analysis": analysis}
    except ImageValidationError:
      return JSONResponse(status_code=400, content={"error": "Invalid JPEG upload"})
    except AnalysisCapacityError as error:
      return JSONResponse(status_code=429, content={"error": "Analysis queue is saturated"}, headers={"Retry-After": str(int(error.retry_after_seconds))})

  @app.get("/v1/sessions/{session_id}/analyses/{analysis_id}")
  async def get_analysis(session_id: str, analysis_id: str, claims: Annotated[dict, Depends(browser_auth)]) -> dict:
    parsed_id = await active(session_id, claims)
    if isinstance(parsed_id, JSONResponse): return parsed_id
    _parse_analysis_id(analysis_id)
    analysis = await analysis_service.get(str(parsed_id), analysis_id)
    if not analysis:
      raise HTTPException(status_code=404, detail="Analysis not found")
    return {"analysis": analysis}

  @app.get("/v1/sessions/{session_id}/monitoring-status")
  async def get_monitoring_status(session_id: str, claims: Annotated[dict, Depends(browser_auth)]) -> dict:
    parsed_id = await active(session_id, claims)
    if isinstance(parsed_id, JSONResponse): return parsed_id
    return await analysis_service.monitoring_status(str(parsed_id))


def _parse_analysis_id(value: str) -> str:
  try:
    parsed = UUID(value)
  except ValueError as error:
    raise HTTPException(status_code=400, detail="Invalid analysis identifier") from error
  if str(parsed).lower() != value.lower():
    raise HTTPException(status_code=400, detail="Invalid analysis identifier")
  return str(parsed)
