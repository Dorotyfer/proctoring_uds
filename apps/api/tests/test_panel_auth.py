from datetime import UTC, datetime, timedelta

import jwt
import pytest


SECRET = "panel-sso-secret-with-at-least-32-characters"


def claims(**changes: object) -> dict:
  now = datetime.now(UTC)
  payload = {
    "moodleUserId": "teacher-1", "displayName": "Teacher One",
    "capabilities": ["local/proctoring:viewowncoursereports"],
    "courseIds": ["course-a"], "reviewCourseIds": [],
    "aud": "proctoring-panel-sso", "iat": now, "exp": now + timedelta(minutes=2)
  }
  payload.update(changes)
  return payload


def token(payload: dict) -> str:
  return jwt.encode(payload, SECRET, algorithm="HS256")


def test_moodle_sso_requires_hs256_audience_timestamps_and_exact_claims() -> None:
  from proctoring.panel_auth import decode_moodle_sso

  decoded = decode_moodle_sso(token(claims()), SECRET)

  assert decoded.moodle_user_id == "teacher-1"
  assert decoded.course_ids == ("course-a",)
  assert decoded.review_course_ids == ()


@pytest.mark.parametrize("payload", [
  claims(exp=datetime.now(UTC) - timedelta(seconds=1)),
  claims(iat=None),
  claims(displayName=None),
  claims(courseIds="course-a"),
  claims(aud="another-audience")
])
def test_moodle_sso_rejects_expired_or_missing_required_claims(payload: dict) -> None:
  from proctoring.panel_auth import PanelAuthenticationError, decode_moodle_sso

  with pytest.raises(PanelAuthenticationError, match="Invalid Moodle panel token"):
    decode_moodle_sso(token(payload), SECRET)


def test_moodle_sso_rejects_a_forged_signature_and_none_algorithm() -> None:
  from proctoring.panel_auth import PanelAuthenticationError, decode_moodle_sso

  valid = token(claims())
  forged = f"{valid}tampered"
  unsigned = jwt.encode(claims(), key="", algorithm="none")

  for value in (forged, unsigned):
    with pytest.raises(PanelAuthenticationError, match="Invalid Moodle panel token"):
      decode_moodle_sso(value, SECRET)


def test_panel_session_has_a_random_csrf_claim_and_never_exposes_its_jwt() -> None:
  from proctoring.panel_auth import decode_moodle_sso, decode_panel_session, issue_panel_session

  first = issue_panel_session(decode_moodle_sso(token(claims()), SECRET), "api-session-secret-with-at-least-32-characters")
  second = issue_panel_session(decode_moodle_sso(token(claims()), SECRET), "api-session-secret-with-at-least-32-characters")
  decoded = decode_panel_session(first, "api-session-secret-with-at-least-32-characters")

  assert decoded.csrf_token != ""
  assert decoded.csrf_token != decode_panel_session(second, "api-session-secret-with-at-least-32-characters").csrf_token
  assert "csrf" in jwt.decode(first, "api-session-secret-with-at-least-32-characters", algorithms=["HS256"], options={"verify_aud": False})
