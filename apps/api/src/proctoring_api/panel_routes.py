"""Cookie-authenticated Moodle panel HTTP routes."""

import hmac
from typing import Annotated, Any
from urllib.parse import quote, urlsplit, urlunsplit
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse

from proctoring_api.panel_auth import (
  PanelAuthenticationError, PanelClaims, can_manage_biometrics, can_review,
  can_view, can_view_evidence, decode_moodle_sso, decode_panel_session,
  is_course_authorized, issue_panel_session, panel_scope, review_scope
)
from proctoring_api.services.evidence import EvidenceAccessError, EvidenceNotFoundError


COOKIE_NAME = "proctoring_panel"
COOKIE_MAX_AGE_SECONDS = 1800


def register_panel_routes(
  repository: object, evidence_service: object, biometric_profile_repository: object,
  *, jwt_secret: str, panel_sso_secret: str, web_origin: str, api_public_url: str
) -> APIRouter:
  router = APIRouter()

  async def panel_user(request: Request) -> PanelClaims:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
      raise HTTPException(status_code=401, detail="Panel authentication required")
    try:
      claims = decode_panel_session(token, jwt_secret)
    except PanelAuthenticationError as error:
      raise HTTPException(status_code=401, detail="Panel authentication required") from error
    if not can_view(claims):
      raise HTTPException(status_code=401, detail="Panel authentication required")
    return claims

  async def csrf_user(request: Request, claims: Annotated[PanelClaims, Depends(panel_user)]) -> PanelClaims:
    origin = request.headers.get("origin")
    csrf = request.headers.get("x-csrf-token")
    if origin != web_origin or not csrf or not hmac.compare_digest(csrf, claims.csrf_token or ""):
      raise HTTPException(status_code=403, detail="Invalid panel CSRF token")
    return claims

  @router.get("/v1/panel/sso")
  async def sso(token: str | None = None, returnUrl: str | None = None) -> Response:
    if not token or not _safe_return_url(returnUrl, web_origin):
      return JSONResponse(status_code=400, content={"error": "Invalid panel sign-in request"})
    try:
      claims = decode_moodle_sso(token, panel_sso_secret)
    except PanelAuthenticationError:
      return JSONResponse(status_code=403, content={"error": "Panel access denied"})
    if not can_view(claims):
      return JSONResponse(status_code=403, content={"error": "Panel access denied"})
    response = RedirectResponse(returnUrl, status_code=302)
    response.set_cookie(COOKIE_NAME, issue_panel_session(claims, jwt_secret), max_age=COOKIE_MAX_AGE_SECONDS,
      httponly=True, secure=True, samesite="lax", path="/")
    return response

  @router.post("/v1/panel/logout", status_code=204)
  async def logout(_: Annotated[PanelClaims, Depends(csrf_user)]) -> Response:
    response = Response(status_code=204)
    response.delete_cookie(COOKIE_NAME, httponly=True, secure=True, samesite="lax", path="/")
    return response

  @router.get("/v1/panel/me")
  async def me(claims: Annotated[PanelClaims, Depends(panel_user)]) -> dict[str, Any]:
    return {"user": {"moodleUserId": claims.moodle_user_id, "displayName": claims.display_name,
      "scope": "institutional" if panel_scope(claims)["institutional"] else "courses",
      "canReview": can_review(claims), "canViewEvidence": can_view_evidence(claims)}, "csrfToken": claims.csrf_token}

  @router.get("/v1/panel/courses")
  async def courses(claims: Annotated[PanelClaims, Depends(panel_user)], query: str = "", page: int = 1, pageSize: int = 25):
    parsed = _pagination(query, page, pageSize)
    if not parsed:
      return JSONResponse(status_code=400, content={"error": "Invalid course query"})
    return await repository.list_courses(panel_scope(claims), parsed)

  @router.get("/v1/panel/courses/{course_id}/sessions")
  async def course_sessions(course_id: str, claims: Annotated[PanelClaims, Depends(panel_user)], query: str = "", page: int = 1, pageSize: int = 25, session_status: str = Query(default="all", alias="status"), alerts: str = "all", dateFrom: str | None = None, dateTo: str | None = None):
    parsed = _session_query(query, page, pageSize, session_status, alerts, dateFrom, dateTo)
    if not _valid_short_string(course_id) or not parsed or not is_course_authorized(course_id, claims):
      return JSONResponse(status_code=404, content={"error": "Course not found"})
    return await repository.list_course_sessions(course_id, panel_scope(claims), parsed)

  @router.get("/v1/panel/sessions")
  async def sessions(claims: Annotated[PanelClaims, Depends(panel_user)]):
    return {"sessions": await repository.list_sessions(panel_scope(claims))}

  @router.get("/v1/panel/sessions/{session_id}")
  async def session_detail(session_id: str, claims: Annotated[PanelClaims, Depends(panel_user)]):
    if not _valid_uuid(session_id):
      return JSONResponse(status_code=400, content={"error": "Invalid session identifier"})
    result = await repository.get_session(session_id, panel_scope(claims))
    if not result:
      return JSONResponse(status_code=404, content={"error": "Session not found"})
    result["evidence"] = [item for item in result.get("evidence", []) if can_view_evidence(claims) and item.get("kind") == "alert"]
    return {"session": result}

  @router.post("/v1/panel/alerts/{alert_id}/review")
  async def review_alert(alert_id: str, request: Request, claims: Annotated[PanelClaims, Depends(csrf_user)]):
    if not can_review(claims):
      return JSONResponse(status_code=403, content={"error": "Alert review capability required"})
    try:
      body = await request.json()
    except ValueError:
      body = None
    if not _valid_uuid(alert_id) or not _valid_review(body):
      return JSONResponse(status_code=400, content={"error": "Invalid alert review"})
    alert = await repository.review_alert(alert_id, claims.moodle_user_id, body["status"], body.get("note", "").strip(), review_scope(claims))
    return {"alert": alert} if alert else JSONResponse(status_code=404, content={"error": "Alert not found"})

  @router.post("/v1/panel/evidence/{evidence_id}/access")
  async def evidence_access(evidence_id: str, request: Request, claims: Annotated[PanelClaims, Depends(csrf_user)]):
    if not can_view_evidence(claims):
      return JSONResponse(status_code=403, content={"error": "Evidence capability required"})
    if not _valid_uuid(evidence_id):
      return JSONResponse(status_code=400, content={"error": "Invalid evidence identifier"})
    try:
      token = await evidence_service.issue_content_token(evidence_id, claims.moodle_user_id, True,
        set(claims.course_ids), panel_scope(claims)["institutional"], request.client.host if request.client else None,
        request.headers.get("user-agent"))
    except EvidenceAccessError:
      return JSONResponse(status_code=404, content={"error": "Evidence not found"})
    return {"url": f"{api_public_url.rstrip('/')}/v1/panel/evidence/{evidence_id}/content?accessToken={quote(token, safe='')}"}

  @router.get("/v1/panel/evidence/{evidence_id}/content")
  async def evidence_content(evidence_id: str, accessToken: str | None = None, request: Request = None):
    if not _valid_uuid(evidence_id) or not accessToken:
      return JSONResponse(status_code=401, content={"error": "Invalid or expired evidence access token"})
    try:
      content = await evidence_service.read_content(evidence_id, accessToken, ip_address=request.client.host if request and request.client else None, user_agent=request.headers.get("user-agent") if request else None)
      return Response(content=content.body, media_type=content.headers.get("Content-Type"), headers=content.headers)
    except EvidenceNotFoundError:
      return JSONResponse(status_code=404, content={"error": "Evidence not found"})
    except EvidenceAccessError:
      return JSONResponse(status_code=401, content={"error": "Invalid or expired evidence access token"})

  @router.post("/v1/panel/biometric-profiles/{moodle_user_id}/reset")
  async def biometric_reset(moodle_user_id: str, claims: Annotated[PanelClaims, Depends(csrf_user)]):
    if not can_manage_biometrics(claims):
      return JSONResponse(status_code=403, content={"error": "Biometric profile management capability required"})
    if not _valid_short_string(moodle_user_id) or biometric_profile_repository is None:
      return JSONResponse(status_code=400, content={"error": "Invalid biometric profile request"})
    biometric = await biometric_profile_repository.reset(moodle_user_id, claims.moodle_user_id)
    return {"biometric": biometric} if biometric else JSONResponse(status_code=404, content={"error": "Biometric profile not found"})

  return router


def _safe_return_url(value: str | None, web_origin: str) -> bool:
  if not value:
    return False
  parsed = urlsplit(value)
  origin = urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))
  return bool(parsed.scheme in {"https", "http"} and parsed.netloc and origin == web_origin)


def _pagination(query: str, page: int, page_size: int) -> dict[str, Any] | None:
  if not isinstance(query, str) or len(query.strip()) > 100 or not 1 <= page or not 1 <= page_size <= 100:
    return None
  return {"query": query.strip(), "page": page, "pageSize": page_size}


def _session_query(query: str, page: int, page_size: int, session_status: str, alerts: str, date_from: str | None, date_to: str | None) -> dict[str, Any] | None:
  result = _pagination(query, page, page_size)
  if not result or session_status not in {"all", "pending", "active", "completed", "expired"} or alerts not in {"all", "open", "any", "none"} or not _valid_date(date_from) or not _valid_date(date_to):
    return None
  return result | {"status": session_status, "alerts": alerts, "dateFrom": date_from, "dateTo": date_to}


def _valid_date(value: str | None) -> bool:
  if value is None:
    return True
  from datetime import date
  try:
    return len(value) == 10 and date.fromisoformat(value).isoformat() == value
  except (TypeError, ValueError):
    return False


def _valid_uuid(value: str) -> bool:
  try:
    return str(UUID(value)).lower() == value.lower()
  except ValueError:
    return False


def _valid_short_string(value: object) -> bool:
  return isinstance(value, str) and 0 < len(value.strip()) <= 255


def _valid_review(value: object) -> bool:
  return isinstance(value, dict) and value.get("status") in {"reviewed", "dismissed"} and isinstance(value.get("note", ""), str) and len(value.get("note", "").strip()) <= 2000
