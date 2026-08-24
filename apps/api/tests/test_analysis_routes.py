from datetime import UTC, datetime, timedelta
from io import BytesIO
from uuid import uuid4

from fastapi.testclient import TestClient
from PIL import Image

from proctoring_api.app import create_app
from proctoring_api.auth import issue_browser_token


SECRET = "browser-token-secret-with-at-least-32-characters"
SESSION_ID = str(uuid4())


class Available:
  async def check(self): pass


class AnalysisService:
  async def issue_challenge(self, session_id):
    return {"id": "challenge-1", "steps": ["center", "turn", "center"], "expiresAt": datetime.now(UTC) + timedelta(seconds=120)}
  async def enqueue_preparation(self, session_id, analysis_id, consent, challenge_id, frames, content_types):
    return {"analysisId": analysis_id, "state": "queued", "type": "preparation"}
  async def enqueue_monitoring(self, session_id, analysis_id, frame, content_type):
    return {"analysisId": analysis_id, "state": "queued", "type": "monitoring"}
  async def get(self, session_id, analysis_id):
    return {"analysisId": analysis_id, "state": "completed", "type": "monitoring", "result": {"face": "present"}}
  async def monitoring_status(self, session_id):
    return {"lastProcessedAt": None, "availability": "available", "nextIntervalSeconds": 10}


def image_bytes():
  output = BytesIO()
  Image.new("RGB", (320, 240), "white").save(output, format="JPEG")
  return output.getvalue()


def test_browser_analysis_routes_require_session_owned_jwt_and_use_multipart_contract() -> None:
  app = create_app(Available(), analysis_service=AnalysisService(), jwt_secret=SECRET)
  token = issue_browser_token(SESSION_ID, "attempt-1", "browser", SECRET)
  headers = {"Authorization": f"Bearer {token}"}
  client = TestClient(app)

  challenge = client.post(f"/v1/sessions/{SESSION_ID}/liveness-challenges", headers=headers)
  response = client.post(f"/v1/sessions/{SESSION_ID}/preparation-analyses", headers=headers, data={
    "analysisId": str(uuid4()), "consentAccepted": "true", "challengeId": challenge.json()["challenge"]["id"]
  }, files={"centerStart": ("center.jpg", image_bytes(), "image/jpeg"), "turn": ("turn.jpg", image_bytes(), "image/jpeg"), "centerEnd": ("end.jpg", image_bytes(), "image/jpeg")})

  assert challenge.status_code == 201
  assert challenge.json()["challenge"]["steps"] == ["center", "turn", "center"]
  assert response.status_code == 202
  assert response.json()["analysis"]["state"] == "queued"
  assert client.get(f"/v1/sessions/{SESSION_ID}/monitoring-status", headers=headers).json()["nextIntervalSeconds"] == 10
