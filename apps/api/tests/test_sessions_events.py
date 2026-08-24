from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from proctoring_api.app import create_app
from proctoring_api.auth import decode_browser_token
from proctoring_api.models import CreateSessionInput, ProctoringSession, SessionStatus
from proctoring_api.services.events import EventService
from proctoring_api.services.sessions import SessionService


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
  assert session.json()["session"] == {"id": str(SESSION_ID), "deviceMode": "browser", "status": "pending", "expiresAt": session.json()["session"]["expiresAt"]}
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
