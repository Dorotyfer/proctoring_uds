"""Final-phase HTTP fixtures for the FastAPI-served browser UI.

The project coordinator intentionally defers executing these with the full suite
until the final verification phase.
"""

import base64
import json

from fastapi.testclient import TestClient

from proctoring.app import create_app


class Available:
  async def check(self) -> None:
    pass


def browser_token(session_id: str = "11111111-1111-4111-8111-111111111111") -> str:
  header = base64.urlsafe_b64encode(b'{"alg":"none"}').decode().rstrip("=")
  payload = base64.urlsafe_b64encode(json.dumps({"sessionId": session_id}).encode()).decode().rstrip("=")
  return f"{header}.{payload}.unsigned"


def web_client() -> TestClient:
  app = create_app(
    Available(),
    api_public_url="https://service.example.edu/proctoring-api",
    moodle_origin="https://moodle.example.edu",
    web_public_base_path="/proctoring"
  )
  return TestClient(app, base_url="https://service.example.edu")


def test_session_page_bootstraps_without_inline_code_and_validates_moodle_return_url() -> None:
  token = browser_token()
  client = web_client()

  accepted = client.get(f"/session/{token}", params={
    "returnUrl": "https://moodle.example.edu/mod/quiz/accessrule/proctoring/launch.php?attemptid=7&callback=1"
  })
  rejected = client.get(f"/session/{token}", params={"returnUrl": "https://evil.example/continue"})

  assert accepted.status_code == rejected.status_code == 200
  assert 'data-return-url="https://moodle.example.edu/mod/quiz/accessrule/proctoring/launch.php?attemptid=7&amp;callback=1"' in accepted.text
  assert 'data-return-url=""' in rejected.text
  assert '<script type="module" src="/proctoring/static/js/session-bootstrap.js"></script>' in accepted.text
  assert "unsafe-inline" not in accepted.headers["content-security-policy"]
  assert "unsafe-eval" not in accepted.headers["content-security-policy"]


def test_web_pages_and_both_static_paths_receive_security_headers() -> None:
  client = web_client()
  responses = [
    client.get("/panel"),
    client.get("/static/css/app.css"),
    client.get("/proctoring/static/js/panel-api.js")
  ]

  for response in responses:
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["permissions-policy"] == "camera=(self)"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "connect-src 'self' https://service.example.edu" in response.headers["content-security-policy"]
    assert "frame-ancestors https://moodle.example.edu" in response.headers["content-security-policy"]


def test_panel_bootstrap_contains_no_cookie_or_csrf_material() -> None:
  response = web_client().get("/panel")

  assert response.status_code == 200
  assert "csrfToken" not in response.text
  assert "proctoring_panel" not in response.text
  assert 'data-api-base-url="https://service.example.edu/proctoring-api"' in response.text
