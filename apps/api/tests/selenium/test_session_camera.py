"""Deferred real-browser coverage using Chromium's built-in fake camera."""

from datetime import UTC, datetime, timedelta
from io import BytesIO
import socket
from threading import Thread
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from PIL import Image
import uvicorn

selenium = pytest.importorskip("selenium")
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as conditions
from selenium.webdriver.support.ui import WebDriverWait

from proctoring_api.app import create_app
from proctoring_api.auth import issue_browser_token
from proctoring_api.models import DeviceMode, SessionStatus


SECRET = "selenium-browser-secret-with-at-least-32-characters"


class Available:
  async def check(self) -> None:
    pass


class BrowserSessions:
  def __init__(self) -> None:
    self.id = uuid4()
    self.status = SessionStatus.PENDING

  async def get_active(self, session_id: UUID):
    if session_id != self.id:
      return None
    return SimpleNamespace(
      id=self.id,
      device_mode=DeviceMode.BROWSER,
      status=self.status,
      expires_at=datetime.now(UTC) + timedelta(minutes=20)
    )


class Events:
  async def record(self, _, payload):
    return {"event": payload, "duplicate": False}


class Analyses:
  def __init__(self, sessions: BrowserSessions) -> None:
    self.sessions = sessions
    self.jobs = {}
    self.preparation_frames = []

  async def issue_challenge(self, _):
    return {
      "id": "challenge-selenium",
      "steps": ["center", "turn-left", "center"],
      "expiresAt": datetime.now(UTC) + timedelta(seconds=120)
    }

  async def enqueue_preparation(self, _, analysis_id, consent, challenge_id, frames, content_types):
    assert consent is True
    assert challenge_id == "challenge-selenium"
    assert content_types == ["image/jpeg", "image/jpeg", "image/jpeg"]
    self.preparation_frames = frames
    self.sessions.status = SessionStatus.ACTIVE
    self.jobs[analysis_id] = {
      "analysisId": analysis_id,
      "state": "completed",
      "type": "preparation",
      "result": {"liveness": "passed", "identity": "enrolled", "profileVersion": 1}
    }
    return {"analysisId": analysis_id, "state": "queued", "type": "preparation"}

  async def enqueue_monitoring(self, _, analysis_id, frame, content_type):
    self.jobs[analysis_id] = {
      "analysisId": analysis_id,
      "state": "completed",
      "type": "monitoring",
      "result": {"face": "present", "alert": False, "events": []}
    }
    return {"analysisId": analysis_id, "state": "queued", "type": "monitoring"}

  async def get(self, _, analysis_id):
    return self.jobs.get(analysis_id)

  async def monitoring_status(self, _):
    return {"lastProcessedAt": None, "availability": "available", "nextIntervalSeconds": 10}


@pytest.fixture
def live_ui():
  port = free_port()
  origin = f"http://127.0.0.1:{port}"
  sessions = BrowserSessions()
  analyses = Analyses(sessions)
  app = create_app(
    Available(),
    session_service=sessions,
    event_service=Events(),
    jwt_secret=SECRET,
    moodle_integration_key="selenium-moodle-key-with-at-least-32-characters",
    analysis_service=analyses,
    api_public_url=origin,
    moodle_origin=origin,
    web_public_base_path="/"
  )
  server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error"))
  thread = Thread(target=server.run, daemon=True)
  thread.start()
  while not server.started:
    thread.join(0.01)
  try:
    yield origin, sessions, analyses
  finally:
    server.should_exit = True
    thread.join(10)


@pytest.fixture
def browser():
  options = webdriver.ChromeOptions()
  options.add_argument("--headless=new")
  options.add_argument("--use-fake-device-for-media-stream")
  options.add_argument("--use-fake-ui-for-media-stream")
  options.add_argument("--window-size=1280,900")
  driver = webdriver.Chrome(options=options)
  try:
    yield driver
  finally:
    driver.quit()


@pytest.mark.selenium
def test_center_turn_center_uses_three_real_bounded_640_by_480_jpegs(live_ui, browser) -> None:
  origin, sessions, analyses = live_ui
  token = issue_browser_token(str(sessions.id), "attempt-selenium", "browser", SECRET)
  browser.get(f"{origin}/session/{token}?returnUrl={origin}/moodle/continue")
  wait = WebDriverWait(browser, 15)

  consent = wait.until(conditions.element_to_be_clickable((By.ID, "biometric-consent")))
  consent.click()
  browser.find_element(By.ID, "start-camera").click()
  capture = wait.until(conditions.element_to_be_clickable((By.ID, "capture-step")))
  for expected in ("center", "turn-left", "center"):
    wait.until(lambda driver: driver.find_element(By.ID, "challenge-prompt").text == expected)
    capture.click()
    capture = wait.until(conditions.presence_of_element_located((By.ID, "capture-step")))

  wait.until(conditions.visibility_of_element_located((By.ID, "continue-link")))
  assert len(analyses.preparation_frames) == 3
  for frame in analyses.preparation_frames:
    assert len(frame) <= 200 * 1024
    assert frame.startswith(b"\xff\xd8") and frame.endswith(b"\xff\xd9")
    with Image.open(BytesIO(frame)) as image:
      assert image.size == (640, 480)


def free_port() -> int:
  with socket.socket() as listener:
    listener.bind(("127.0.0.1", 0))
    return listener.getsockname()[1]
