"""Moodle panel SSO and panel-session authorization contracts."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import secrets
from typing import Any

import jwt


MOODLE_SSO_AUDIENCE = "proctoring-panel-sso"
PANEL_AUDIENCE = "proctoring-panel"
PANEL_SESSION_LIFETIME = timedelta(minutes=30)
PANEL_CAPABILITIES = {
  "institution": "local/proctoring:viewinstitutionreports",
  "review": "local/proctoring:reviewowncoursealerts",
  "manage_policies": "local/proctoring:managepolicies",
  "view": "local/proctoring:viewowncoursereports",
  "view_evidence": "local/proctoring:viewbiometricevidence"
}


class PanelAuthenticationError(ValueError):
  """A sanitized panel sign-in or session failure."""


@dataclass(frozen=True)
class PanelClaims:
  moodle_user_id: str
  display_name: str
  capabilities: tuple[str, ...]
  course_ids: tuple[str, ...]
  review_course_ids: tuple[str, ...]
  csrf_token: str | None = None


def decode_moodle_sso(token: str, secret: str) -> PanelClaims:
  return _decode(token, secret, MOODLE_SSO_AUDIENCE, "Invalid Moodle panel token", require_csrf=False)


def issue_panel_session(claims: PanelClaims, secret: str) -> str:
  now = datetime.now(UTC)
  return jwt.encode({
    "moodleUserId": claims.moodle_user_id, "displayName": claims.display_name,
    "capabilities": list(claims.capabilities), "courseIds": list(claims.course_ids),
    "reviewCourseIds": list(claims.review_course_ids), "csrf": secrets.token_urlsafe(32),
    "aud": PANEL_AUDIENCE, "iat": now, "exp": now + PANEL_SESSION_LIFETIME
  }, secret, algorithm="HS256")


def decode_panel_session(token: str, secret: str) -> PanelClaims:
  return _decode(token, secret, PANEL_AUDIENCE, "Panel authentication required", require_csrf=True)


def panel_scope(claims: PanelClaims) -> dict[str, Any]:
  return {"courseIds": list(claims.course_ids), "institutional": can_institutional(claims)}


def review_scope(claims: PanelClaims) -> dict[str, Any]:
  return {"courseIds": list(claims.review_course_ids), "institutional": can_institutional(claims)}


def can_institutional(claims: PanelClaims) -> bool:
  return PANEL_CAPABILITIES["institution"] in claims.capabilities


def can_view(claims: PanelClaims) -> bool:
  return PANEL_CAPABILITIES["view"] in claims.capabilities or can_institutional(claims)


def can_review(claims: PanelClaims) -> bool:
  return PANEL_CAPABILITIES["review"] in claims.capabilities or can_institutional(claims)


def can_view_evidence(claims: PanelClaims) -> bool:
  return PANEL_CAPABILITIES["view_evidence"] in claims.capabilities


def can_manage_biometrics(claims: PanelClaims) -> bool:
  return PANEL_CAPABILITIES["manage_policies"] in claims.capabilities


def is_course_authorized(course_id: str, claims: PanelClaims) -> bool:
  return can_institutional(claims) or course_id in claims.course_ids


def _decode(token: str, secret: str, audience: str, message: str, *, require_csrf: bool) -> PanelClaims:
  required = ["exp", "iat", "aud", "moodleUserId", "displayName", "capabilities", "courseIds", "reviewCourseIds"]
  if require_csrf:
    required.append("csrf")
  try:
    payload = jwt.decode(token, secret, algorithms=["HS256"], audience=audience, options={"require": required})
    csrf = payload.get("csrf")
    if require_csrf and (not isinstance(csrf, str) or not csrf):
      raise ValueError("missing csrf")
    if not isinstance(payload.get("moodleUserId"), str) or not payload["moodleUserId"]:
      raise ValueError("invalid user")
    if not isinstance(payload.get("displayName"), str):
      raise ValueError("invalid display name")
    arrays = ("capabilities", "courseIds", "reviewCourseIds")
    if any(not isinstance(payload.get(field), list) or any(not isinstance(item, str) for item in payload[field]) for field in arrays):
      raise ValueError("invalid scope")
    return PanelClaims(payload["moodleUserId"], payload["displayName"], tuple(payload["capabilities"]),
      tuple(payload["courseIds"]), tuple(payload["reviewCourseIds"]), csrf)
  except (jwt.PyJWTError, KeyError, TypeError, ValueError) as error:
    raise PanelAuthenticationError(message) from error
