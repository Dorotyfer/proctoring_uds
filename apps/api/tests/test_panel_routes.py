from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
import jwt

from proctoring.app import create_app


PANEL_SECRET = "panel-sso-secret-with-at-least-32-characters"
JWT_SECRET = "api-session-secret-with-at-least-32-characters"
WEB_ORIGIN = "https://panel.example.edu"


class Available:
  async def check(self) -> None: pass


class PanelRepository:
  def __init__(self) -> None:
    self.calls: list[tuple] = []

  async def list_courses(self, scope, query):
    self.calls.append(("courses", scope, query))
    return {"courses": [], "page": query["page"], "pageSize": query["pageSize"], "total": 0, "totalPages": 0}

  async def list_course_sessions(self, course_id, scope, query):
    self.calls.append(("course-sessions", course_id, scope, query))
    return {"sessions": [], "page": query["page"], "pageSize": query["pageSize"], "total": 0, "totalPages": 0}

  async def list_sessions(self, scope):
    self.calls.append(("sessions", scope))
    return [{"id": "session-a", "courseId": "course-a"}]

  async def get_session(self, session_id, scope):
    self.calls.append(("detail", session_id, scope))
    return {"id": session_id, "courseId": "course-a", "evidence": [
      {"id": "alert", "kind": "alert"}, {"id": "interval", "kind": "interval"}
    ]}

  async def review_alert(self, alert_id, reviewer_id, review_status, note, scope):
    self.calls.append(("review", alert_id, reviewer_id, review_status, note, scope))
    return {"id": alert_id, "status": review_status, "reviewed_by": reviewer_id, "review_note": note}


class EvidenceService:
  def __init__(self) -> None: self.calls: list[tuple] = []
  async def issue_content_token(self, *args, **kwargs):
    self.calls.append(("issue", args, kwargs))
    return "scoped-token"
  async def read_content(self, evidence_id, access_token, **kwargs):
    self.calls.append(("read", evidence_id, access_token, kwargs))
    from proctoring.services.evidence import EvidenceContent
    return EvidenceContent(b"image", {"Cache-Control": "private, no-store", "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff", "Content-Disposition": 'inline; filename="evidence.jpg"'})


class BiometricRepository:
  async def reset(self, moodle_user_id, actor_moodle_user_id):
    return {"moodleUserId": moodle_user_id, "state": "revoked", "actor": actor_moodle_user_id}


def moodle_token(capabilities=None, **changes):
  now = datetime.now(UTC)
  payload = {"moodleUserId": "teacher-1", "displayName": "Teacher One", "capabilities": capabilities or ["local/proctoring:viewowncoursereports"], "courseIds": ["course-a"], "reviewCourseIds": ["course-a"], "aud": "proctoring-panel-sso", "iat": now, "exp": now + timedelta(minutes=2)}
  payload.update(changes)
  return jwt.encode(payload, PANEL_SECRET, algorithm="HS256")


def client(evidence_override=None, web_origin=WEB_ORIGIN):
  repository = PanelRepository()
  evidence = evidence_override or EvidenceService()
  app = create_app(Available(), panel_repository=repository, evidence_service=evidence,
    biometric_profile_repository=BiometricRepository(), jwt_secret=JWT_SECRET,
    panel_sso_secret=PANEL_SECRET, web_origin=web_origin, api_public_url="https://api.example.edu/proctoring-api")
  return TestClient(app, base_url="https://api.example.edu"), repository, evidence


def sign_in(http, capabilities=None):
  response = http.get("/v1/panel/sso", params={"token": moodle_token(capabilities), "returnUrl": f"{WEB_ORIGIN}/panel"}, follow_redirects=False)
  assert response.status_code == 302
  return response


def csrf(http):
  return http.get("/v1/panel/me").json()["csrfToken"]


def mutation_headers(http):
  return {"Origin": WEB_ORIGIN, "X-CSRF-Token": csrf(http)}


def test_sso_sets_a_fixed_secure_lax_http_only_cookie_and_rejects_open_redirects() -> None:
  http, _, _ = client()

  login = sign_in(http)
  rejected = http.get("/v1/panel/sso", params={"token": moodle_token(), "returnUrl": "https://evil.example/panel"}, follow_redirects=False)

  cookie = login.headers["set-cookie"]
  assert "HttpOnly" in cookie and "Secure" in cookie and "SameSite=lax" in cookie
  assert "Path=/" in cookie and "Max-Age=1800" in cookie
  assert login.headers["referrer-policy"] == "no-referrer"
  assert login.headers["cache-control"] == "no-store"
  assert rejected.status_code == 400
  assert rejected.json() == {"error": "Invalid panel sign-in request"}


def test_me_exposes_sanitized_profile_scope_capabilities_and_csrf_not_raw_cookie() -> None:
  http, _, _ = client()
  sign_in(http, ["local/proctoring:viewowncoursereports", "local/proctoring:reviewowncoursealerts"])

  response = http.get("/v1/panel/me")

  assert response.status_code == 200
  assert response.json() == {"user": {"moodleUserId": "teacher-1", "displayName": "Teacher One", "scope": "courses", "canReview": True, "canViewEvidence": False}, "csrfToken": response.json()["csrfToken"]}
  assert "." not in response.json()["csrfToken"]


def test_panel_lists_use_signed_course_scope_and_cross_course_is_hidden() -> None:
  http, repository, _ = client()
  sign_in(http)

  courses = http.get("/v1/panel/courses", params={"query": "law", "page": 2, "pageSize": 10})
  sessions = http.get("/v1/panel/courses/course-a/sessions", params={"alerts": "open", "status": "active"})
  forbidden = http.get("/v1/panel/courses/course-b/sessions")

  assert courses.status_code == sessions.status_code == 200
  assert forbidden.status_code == 404
  assert repository.calls[0][1] == {"courseIds": ["course-a"], "institutional": False}
  assert repository.calls[1][2] == {"courseIds": ["course-a"], "institutional": False}
  assert repository.calls[1][3]["status"] == "active"


def test_mutations_require_exact_origin_and_constant_time_csrf_then_enforce_capabilities() -> None:
  http, repository, _ = client()
  sign_in(http, ["local/proctoring:viewowncoursereports", "local/proctoring:reviewowncoursealerts"])

  missing = http.post("/v1/panel/alerts/11111111-1111-4111-8111-111111111111/review", json={"status": "reviewed", "note": "ok"})
  wrong_origin = http.post("/v1/panel/alerts/11111111-1111-4111-8111-111111111111/review", headers={"Origin": "https://evil.example", "X-CSRF-Token": csrf(http)}, json={"status": "reviewed", "note": "ok"})
  valid = http.post("/v1/panel/alerts/11111111-1111-4111-8111-111111111111/review", headers=mutation_headers(http), json={"status": "reviewed", "note": "ok"})

  assert missing.status_code == wrong_origin.status_code == 403
  assert valid.status_code == 200
  assert repository.calls[-1][0] == "review"
  assert repository.calls[-1][-1] == {"courseIds": ["course-a"], "institutional": False}


def test_canonical_origin_drives_cors_sso_csrf_and_the_complete_panel_client_sequence() -> None:
  canonical_origin = "https://panel.example.edu"
  http, repository, _ = client(web_origin="HTTPS://PANEL.Example.EDU:443")
  login = http.get("/v1/panel/sso", params={
    "token": moodle_token(["local/proctoring:viewowncoursereports", "local/proctoring:reviewowncoursealerts"]),
    "returnUrl": "https://PANEL.example.edu:443/panel"
  }, follow_redirects=False)
  cors = http.options("/v1/panel/alerts/11111111-1111-4111-8111-111111111111/review", headers={
    "Origin": canonical_origin, "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "X-CSRF-Token, Content-Type"
  })
  profile = http.get("/v1/panel/me")
  review = http.post("/v1/panel/alerts/11111111-1111-4111-8111-111111111111/review", headers={
    "Origin": canonical_origin, "X-CSRF-Token": profile.json()["csrfToken"]
  }, json={"status": "reviewed", "note": "client sequence"})

  assert login.status_code == 302
  assert cors.headers["access-control-allow-origin"] == canonical_origin
  assert profile.status_code == review.status_code == 200
  assert repository.calls[-1][0] == "review"


def test_evidence_access_and_content_are_scoped_and_content_is_safe() -> None:
  http, _, evidence = client()
  sign_in(http, ["local/proctoring:viewowncoursereports", "local/proctoring:viewbiometricevidence"])
  evidence_id = "11111111-1111-4111-8111-111111111111"

  access = http.post(f"/v1/panel/evidence/{evidence_id}/access", headers=mutation_headers(http))
  content = http.get(f"/v1/panel/evidence/{evidence_id}/content", params={"accessToken": "scoped-token"})

  assert access.status_code == 200
  assert access.json() == {"url": f"https://api.example.edu/proctoring-api/v1/panel/evidence/{evidence_id}/content?accessToken=scoped-token"}
  assert content.status_code == 200 and content.content == b"image"
  assert content.headers["cache-control"] == "private, no-store"
  assert content.headers["x-content-type-options"] == "nosniff"
  assert access.headers["cache-control"] == "no-store"
  assert access.headers["referrer-policy"] == "no-referrer"
  assert content.headers["referrer-policy"] == "no-referrer"
  assert evidence.calls[0][0] == "issue" and evidence.calls[1][0] == "read"


def test_evidence_content_returns_not_found_for_a_valid_token_with_deleted_or_non_alert_evidence() -> None:
  from proctoring.services.evidence import EvidenceNotFoundError

  class MissingEvidence:
    async def issue_content_token(self, *args, **kwargs): return "scoped-token"
    async def read_content(self, *args, **kwargs): raise EvidenceNotFoundError("Evidence content unavailable")

  http, _, _ = client(MissingEvidence())
  evidence_id = "11111111-1111-4111-8111-111111111111"

  response = http.get(f"/v1/panel/evidence/{evidence_id}/content", params={"accessToken": "scoped-token"})

  assert response.status_code == 404
  assert response.json() == {"error": "Evidence not found"}


def test_biometric_reset_and_logout_are_csrf_protected() -> None:
  http, _, _ = client()
  sign_in(http, ["local/proctoring:viewowncoursereports", "local/proctoring:managepolicies"])

  reset = http.post("/v1/panel/biometric-profiles/student-1/reset", headers=mutation_headers(http))
  logout = http.post("/v1/panel/logout", headers=mutation_headers(http))

  assert reset.status_code == 200
  assert reset.json()["biometric"]["state"] == "revoked"
  assert logout.status_code == 204
  cookie = logout.headers["set-cookie"]
  assert "Max-Age=0" in cookie and "Path=/" in cookie
  assert "HttpOnly" in cookie and "Secure" in cookie and "SameSite=lax" in cookie
