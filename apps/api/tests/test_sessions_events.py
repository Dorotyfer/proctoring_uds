from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import jwt
import pytest
from fastapi.testclient import TestClient

from proctoring.app import create_app
from proctoring.auth import decode_browser_token
from proctoring.models import CreateSessionInput, ProctoringSession, SessionStatus
from proctoring.services.events import EventService
from proctoring.services.sessions import SessionService


SESSION_ID = UUID("e3d9cce1-a5b8-4bfe-88e1-68a57475266d")
OTHER_SESSION_ID = UUID("cf648229-b07d-4f38-a964-88e5010df6d2")
NOW = datetime.now(UTC)


def session_payload() -> dict[str, str | None]:
  return {
    "moodleUserId": "student-1", "moodleCourseId": "course-1", "moodleQuizId": "quiz-1",
    "moodleAttemptId": "attempt-1", "courseName": "Applied Security", "quizName": "Final quiz",
    "studentName": "Student One", "studentDocument": None, "deviceMode": "browser",
    "issuedAt": (NOW - timedelta(minutes=1)).isoformat().replace("+00:00", "Z"),
    "expiresAt": (NOW + timedelta(minutes=30)).isoformat().replace("+00:00", "Z")
  }


class SessionRepositoryFake:
  def __init__(self) -> None:
    self.sessions: dict[UUID, ProctoringSession] = {}
    self.by_attempt: dict[str, UUID] = {}

  async def create(self, input_data: CreateSessionInput) -> ProctoringSession:
    existing_id = self.by_attempt.get(input_data.moodle_attempt_id)
    if existing_id:
      return self.sessions[existing_id]
    session = ProctoringSession(
      **input_data.model_dump(), id=SESSION_ID, status=SessionStatus.PENDING,
      createdAt=NOW.isoformat().replace("+00:00", "Z")
    )
    self.sessions[SESSION_ID] = session
    self.by_attempt[input_data.moodle_attempt_id] = SESSION_ID
    return session

  async def find_by_id(self, session_id: UUID) -> ProctoringSession | None:
    return self.sessions.get(session_id)

  async def complete(self, session_id: UUID) -> ProctoringSession | None:
    session = self.sessions.get(session_id)
    if not session:
      return None
    completed = session.model_copy(update={"status": SessionStatus.COMPLETED})
    self.sessions[session_id] = completed
    return completed


class EventRepositoryFake:
  def __init__(self) -> None:
    self.events: list[dict[str, object]] = []

  async def create(self, session_id: UUID, event):
    result = {"id": uuid4(), "sessionId": session_id, "clientEventId": event.client_event_id,
      "type": event.type, "occurredAt": event.occurred_at, "metadata": event.metadata,
      "receivedAt": NOW}
    self.events.append(result)
    return result


class NullHealthService:
  async def check(self) -> None:
    return None


def create_client() -> tuple[TestClient, SessionRepositoryFake]:
  sessions = SessionRepositoryFake()
  session_service = SessionService(sessions)
  event_service = EventService(session_service, EventRepositoryFake())
  return TestClient(create_app(
    NullHealthService(), event_service=event_service,
    jwt_secret="test-secret-that-is-at-least-thirty-two-characters",
    moodle_integration_key="moodle-key-that-is-at-least-thirty-two-characters",
    session_service=session_service
  )), sessions


def create_session(client: TestClient) -> dict[str, object]:
  response = client.post("/v1/internal/sessions", headers={
    "X-Moodle-Integration-Key": "moodle-key-that-is-at-least-thirty-two-characters"
  }, json=session_payload())
  assert response.status_code == 201
  return response.json()["session"]


def test_internal_session_creation_is_key_protected_idempotent_and_preserves_failure_policy() -> None:
  client, _ = create_client()
  unauthorized = client.post("/v1/internal/sessions", json=session_payload())
  first = create_session(client)
  second = create_session(client)

  assert unauthorized.status_code == 401
  assert unauthorized.json() == {"error": "Unauthorized Moodle integration request"}
  assert first["id"] == str(SESSION_ID)
  assert second["id"] == first["id"]
  assert first["failurePolicy"] == "block"


def test_internal_session_round_trips_allow_with_alert_failure_policy_idempotently() -> None:
  client, _ = create_client()
  payload = session_payload() | {"failurePolicy": "allow_with_alert"}
  headers = {"X-Moodle-Integration-Key": "moodle-key-that-is-at-least-thirty-two-characters"}
  first = client.post("/v1/internal/sessions", headers=headers, json=payload)
  second = client.post("/v1/internal/sessions", headers=headers, json=payload)

  assert first.status_code == 201
  assert second.status_code == 201
  assert first.json()["session"]["failurePolicy"] == "allow_with_alert"
  assert second.json()["session"]["failurePolicy"] == "allow_with_alert"


def test_moodle_can_issue_a_15_minute_browser_token_and_read_or_complete_status() -> None:
  client, _ = create_client()
  create_session(client)
  headers = {"X-Moodle-Integration-Key": "moodle-key-that-is-at-least-thirty-two-characters"}
  token_response = client.post(f"/v1/internal/sessions/{SESSION_ID}/browser-token", headers=headers)
  claims = decode_browser_token(token_response.json()["browserToken"], "test-secret-that-is-at-least-thirty-two-characters")
  status_response = client.post(f"/v1/internal/sessions/{SESSION_ID}/status", headers=headers)
  complete_response = client.post(f"/v1/internal/sessions/{SESSION_ID}/complete", headers=headers)

  assert token_response.status_code == 200
  assert claims["sessionId"] == str(SESSION_ID)
  assert claims["aud"] == "proctoring-browser"
  assert 899 <= claims["exp"] - claims["iat"] <= 900
  assert status_response.json() == {"session": {"id": str(SESSION_ID), "status": "pending"}}
  assert complete_response.json()["session"]["status"] == "completed"


def test_browser_session_and_events_require_a_token_owned_by_the_path_session() -> None:
  client, _ = create_client()
  create_session(client)
  token = client.post(f"/v1/internal/sessions/{SESSION_ID}/browser-token", headers={
    "X-Moodle-Integration-Key": "moodle-key-that-is-at-least-thirty-two-characters"
  }).json()["browserToken"]
  headers = {"Authorization": f"Bearer {token}"}
  session = client.get(f"/v1/sessions/{SESSION_ID}", headers=headers)
  foreign = client.post(f"/v1/sessions/{OTHER_SESSION_ID}/events", headers=headers, json=event_payload())
  event = client.post(f"/v1/sessions/{SESSION_ID}/events", headers=headers, json=event_payload())

  assert session.status_code == 200
  assert session.json()["session"] == {"id": str(SESSION_ID), "deviceMode": "browser", "status": "pending", "expiresAt": session.json()["session"]["expiresAt"], "biometric": {"enrollmentVersion": None, "state": "unregistered"}}
  assert foreign.status_code == 403
  assert foreign.json() == {"error": "Token does not belong to this session"}
  assert event.status_code == 201
  assert event.json()["event"]["type"] == "camera_interrupted"


def event_payload() -> dict[str, object]:
  return {"clientEventId": str(uuid4()), "type": "camera_interrupted",
    "occurredAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    "metadata": {"source": "camera-track"}}


def test_event_service_rejects_inactive_or_out_of_window_events_before_persistence() -> None:
  import asyncio
  import pytest

  session_repository = SessionRepositoryFake()
  event_repository = EventRepositoryFake()
  service = EventService(SessionService(session_repository), event_repository)
  asyncio.run(session_repository.create(CreateSessionInput.model_validate(session_payload())))
  stale = event_payload()
  stale["occurredAt"] = (NOW - timedelta(minutes=7)).isoformat().replace("+00:00", "Z")

  response = asyncio.run(service.record(SESSION_ID, event_payload()))

  assert response["event"]["sessionId"] == SESSION_ID
  with pytest.raises(ValueError, match="outside the accepted range"):
    asyncio.run(service.record(SESSION_ID, stale))
  assert len(event_repository.events) == 1


def test_event_service_rejects_a_session_completed_after_the_browser_loaded() -> None:
  import asyncio
  from proctoring.services.events import SessionUnavailableError

  sessions = SessionRepositoryFake()
  service = EventService(SessionService(sessions), EventRepositoryFake())
  asyncio.run(sessions.create(CreateSessionInput.model_validate(session_payload())))
  asyncio.run(sessions.complete(SESSION_ID))

  with pytest.raises(SessionUnavailableError):
    asyncio.run(service.record(SESSION_ID, event_payload()))


def create_client_with_origin(origin: str) -> tuple[TestClient, SessionRepositoryFake]:
  sessions = SessionRepositoryFake()
  session_service = SessionService(sessions)
  return TestClient(create_app(
    NullHealthService(), event_service=EventService(session_service, EventRepositoryFake()),
    jwt_secret="test-secret-that-is-at-least-thirty-two-characters",
    moodle_integration_key="moodle-key-that-is-at-least-thirty-two-characters",
    session_service=session_service, web_origin=origin
  )), sessions


def test_cors_allows_only_configured_origin_and_preflight_browser_headers() -> None:
  client, _ = create_client_with_origin("https://proctoring.example.edu")
  allowed = client.options("/v1/sessions/anything/events", headers={"Origin": "https://proctoring.example.edu", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"})
  denied = client.options("/v1/sessions/anything/events", headers={"Origin": "https://other.example.edu", "Access-Control-Request-Method": "POST"})

  assert allowed.status_code == 200
  assert allowed.headers["access-control-allow-origin"] == "https://proctoring.example.edu"
  assert "authorization" in allowed.headers["access-control-allow-headers"].lower()
  assert "content-type" in allowed.headers["access-control-allow-headers"].lower()
  assert allowed.headers["access-control-allow-credentials"] == "true"
  assert "access-control-allow-origin" not in denied.headers


def test_session_and_event_non_object_json_bodies_keep_node_error_responses() -> None:
  client, _ = create_client()
  key_headers = {"X-Moodle-Integration-Key": "moodle-key-that-is-at-least-thirty-two-characters"}
  for body in ("null", "[]"):
    response = client.post("/v1/internal/sessions", headers=key_headers, content=body)
    assert response.status_code == 400
    assert response.json()["error"] == "Invalid session payload"
  create_session(client)
  token = client.post(f"/v1/internal/sessions/{SESSION_ID}/browser-token", headers=key_headers).json()["browserToken"]
  for body in ("null", "[]"):
    response = client.post(f"/v1/sessions/{SESSION_ID}/events", headers={"Authorization": f"Bearer {token}"}, content=body)
    assert response.status_code == 400
    assert response.json() == {"error": "Invalid event payload"}


def test_invalid_session_objects_include_stable_zod_compatible_details() -> None:
  client, _ = create_client()
  response = client.post("/v1/internal/sessions", headers={"X-Moodle-Integration-Key": "moodle-key-that-is-at-least-thirty-two-characters"}, json={"deviceMode": "desktop"})

  assert response.status_code == 400
  assert response.json()["error"] == "Invalid session payload"
  assert response.json()["details"] == [
    {"code": "invalid_type", "expected": "string", "received": "undefined", "path": ["moodleUserId"], "message": "Required"},
    {"code": "invalid_type", "expected": "string", "received": "undefined", "path": ["moodleCourseId"], "message": "Required"},
    {"code": "invalid_type", "expected": "string", "received": "undefined", "path": ["moodleQuizId"], "message": "Required"},
    {"code": "invalid_type", "expected": "string", "received": "undefined", "path": ["moodleAttemptId"], "message": "Required"},
    {"code": "invalid_type", "expected": "string", "received": "undefined", "path": ["courseName"], "message": "Required"},
    {"code": "invalid_type", "expected": "string", "received": "undefined", "path": ["quizName"], "message": "Required"},
    {"code": "invalid_type", "expected": "string", "received": "undefined", "path": ["studentName"], "message": "Required"},
    {"code": "invalid_type", "expected": "string", "received": "undefined", "path": ["studentDocument"], "message": "Required"},
    {"code": "invalid_enum_value", "options": ["browser", "seb"], "received": "desktop", "path": ["deviceMode"], "message": "Invalid enum value. Expected 'browser' | 'seb', received 'desktop'"},
    {"code": "invalid_type", "expected": "string", "received": "undefined", "path": ["issuedAt"], "message": "Required"},
    {"code": "invalid_type", "expected": "string", "received": "undefined", "path": ["expiresAt"], "message": "Required"}
  ]


@pytest.mark.parametrize(("mutate", "expected"), [
  (lambda payload: payload.pop("studentDocument"), [{"code": "invalid_type", "expected": "string", "received": "undefined", "path": ["studentDocument"], "message": "Required"}]),
  (lambda payload: payload.update({"moodleUserId": 7}), [{"code": "invalid_type", "expected": "string", "received": "number", "path": ["moodleUserId"], "message": "Expected string, received number"}]),
  (lambda payload: payload.update({"studentName": " \t "}), [{"code": "too_small", "minimum": 1, "type": "string", "inclusive": True, "exact": False, "message": "String must contain at least 1 character(s)", "path": ["studentName"]}]),
  (lambda payload: payload.update({"courseName": "x" * 256}), [{"code": "too_big", "maximum": 255, "type": "string", "inclusive": True, "exact": False, "message": "String must contain at most 255 character(s)", "path": ["courseName"]}]),
  (lambda payload: payload.update({"studentDocument": "x" * 101}), [{"code": "too_big", "maximum": 100, "type": "string", "inclusive": True, "exact": False, "message": "String must contain at most 100 character(s)", "path": ["studentDocument"]}]),
  (lambda payload: payload.update({"deviceMode": "desktop"}), [{"code": "invalid_enum_value", "options": ["browser", "seb"], "received": "desktop", "path": ["deviceMode"], "message": "Invalid enum value. Expected 'browser' | 'seb', received 'desktop'"}]),
  (lambda payload: payload.update({"deviceMode": 1}), [{"code": "invalid_type", "expected": "'browser' | 'seb'", "received": "number", "path": ["deviceMode"], "message": "Expected 'browser' | 'seb', received number"}]),
  (lambda payload: payload.update({"issuedAt": "not-a-datetime"}), [{"code": "invalid_string", "validation": "datetime", "path": ["issuedAt"], "message": "Invalid datetime"}]),
  (lambda payload: payload.update({"issuedAt": 1}), [{"code": "invalid_type", "expected": "string", "received": "number", "path": ["issuedAt"], "message": "Expected string, received number"}]),
  (lambda payload: payload.update({"expiresAt": payload["issuedAt"]}), [{"code": "custom", "path": ["expiresAt"], "message": "expiresAt must be later than issuedAt"}]),
  (lambda payload: payload.update({"moodleUserId": 7, "courseName": "x" * 256, "deviceMode": "desktop"}), [
    {"code": "invalid_type", "expected": "string", "received": "number", "path": ["moodleUserId"], "message": "Expected string, received number"},
    {"code": "too_big", "maximum": 255, "type": "string", "inclusive": True, "exact": False, "message": "String must contain at most 255 character(s)", "path": ["courseName"]},
    {"code": "invalid_enum_value", "options": ["browser", "seb"], "received": "desktop", "path": ["deviceMode"], "message": "Invalid enum value. Expected 'browser' | 'seb', received 'desktop'"}
  ])
])
def test_session_validation_details_match_legacy_zod_issue_families(mutate, expected) -> None:
  client, _ = create_client()
  payload = session_payload()
  mutate(payload)

  response = client.post("/v1/internal/sessions", headers={"X-Moodle-Integration-Key": "moodle-key-that-is-at-least-thirty-two-characters"}, json=payload)

  assert response.status_code == 400
  assert response.json() == {"error": "Invalid session payload", "details": expected}


def test_nullable_student_document_is_accepted_by_the_legacy_session_contract() -> None:
  client, _ = create_client()
  response = client.post("/v1/internal/sessions", headers={"X-Moodle-Integration-Key": "moodle-key-that-is-at-least-thirty-two-characters"}, json=session_payload() | {"studentDocument": None})
  assert response.status_code == 201


def test_browser_token_rejects_tampering_and_missing_required_claims() -> None:
  client, _ = create_client()
  create_session(client)
  key_headers = {"X-Moodle-Integration-Key": "moodle-key-that-is-at-least-thirty-two-characters"}
  token = client.post(f"/v1/internal/sessions/{SESSION_ID}/browser-token", headers=key_headers).json()["browserToken"]
  header, payload, signature = token.split(".")
  tampered = f"{header}.{payload}.{'a' if signature[0] != 'a' else 'b'}{signature[1:]}"
  incomplete = jwt.encode({"sessionId": str(SESSION_ID), "aud": "proctoring-browser", "exp": NOW + timedelta(minutes=5)}, "test-secret-that-is-at-least-thirty-two-characters", algorithm="HS256")
  missing_expiration = jwt.encode({"sessionId": str(SESSION_ID), "moodleAttemptId": "attempt-1", "deviceMode": "browser", "aud": "proctoring-browser", "iat": NOW}, "test-secret-that-is-at-least-thirty-two-characters", algorithm="HS256")
  for candidate in (tampered, incomplete, missing_expiration):
    response = client.get(f"/v1/sessions/{SESSION_ID}", headers={"Authorization": f"Bearer {candidate}"})
    assert response.status_code == 401
    assert response.json() == {"error": "Invalid or expired browser token"}


def test_browser_projection_includes_unregistered_biometric_default() -> None:
  client, _ = create_client()
  create_session(client)
  token = client.post(f"/v1/internal/sessions/{SESSION_ID}/browser-token", headers={"X-Moodle-Integration-Key": "moodle-key-that-is-at-least-thirty-two-characters"}).json()["browserToken"]
  response = client.get(f"/v1/sessions/{SESSION_ID}", headers={"Authorization": f"Bearer {token}"})
  assert response.json()["session"]["biometric"] == {"enrollmentVersion": None, "state": "unregistered"}


@pytest.mark.parametrize("identifier", ["{e3d9cce1-a5b8-4bfe-88e1-68a57475266d}"])
def test_internal_routes_reject_noncanonical_uuid_identifiers(identifier: str) -> None:
  client, _ = create_client()
  response = client.post(f"/v1/internal/sessions/{identifier}/status", headers={"X-Moodle-Integration-Key": "moodle-key-that-is-at-least-thirty-two-characters"})
  assert response.status_code == 400
  assert response.json() == {"error": "Invalid session identifier"}


def test_uppercase_canonical_uuid_is_normalized_for_lookup_and_token_ownership() -> None:
  client, _ = create_client()
  create_session(client)
  uppercase = str(SESSION_ID).upper()
  token = client.post(f"/v1/internal/sessions/{uppercase}/browser-token", headers={"X-Moodle-Integration-Key": "moodle-key-that-is-at-least-thirty-two-characters"})
  response = client.get(f"/v1/sessions/{uppercase}", headers={"Authorization": f"Bearer {token.json()['browserToken']}"})

  assert token.status_code == 200
  assert response.status_code == 200


def test_locked_unavailable_event_is_mapped_to_409_before_broad_value_errors() -> None:
  class UnavailableEvents:
    async def record(self, *_):
      from proctoring.services.events import SessionUnavailableError
      raise SessionUnavailableError("locked session completed")

  sessions = SessionRepositoryFake()
  service = SessionService(sessions)
  client = TestClient(create_app(NullHealthService(), session_service=service, event_service=UnavailableEvents(), jwt_secret="test-secret-that-is-at-least-thirty-two-characters", moodle_integration_key="moodle-key-that-is-at-least-thirty-two-characters"))
  create_session(client)
  token = client.post(f"/v1/internal/sessions/{SESSION_ID}/browser-token", headers={"X-Moodle-Integration-Key": "moodle-key-that-is-at-least-thirty-two-characters"}).json()["browserToken"]

  response = client.post(f"/v1/sessions/{SESSION_ID}/events", headers={"Authorization": f"Bearer {token}"}, json=event_payload())

  assert response.status_code == 409
  assert response.json() == {"error": "Session is not active"}
