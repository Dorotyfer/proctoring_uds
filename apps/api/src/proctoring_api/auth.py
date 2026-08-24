"""Authentication helpers for Moodle integrations and browser sessions."""

import hmac
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from fastapi import Header, HTTPException, status


BROWSER_AUDIENCE = "proctoring-browser"
BROWSER_TOKEN_LIFETIME = timedelta(minutes=15)


def has_valid_integration_key(received: str | None, expected: str) -> bool:
  """Compare keys without leaking matching prefixes through timing."""

  if not isinstance(received, str):
    return False
  return hmac.compare_digest(received.encode(), expected.encode())


def require_integration_key(expected: str):
  """Create a FastAPI dependency for Moodle's private key."""

  async def verify(
    received: str | None = Header(default=None, alias="X-Moodle-Integration-Key")
  ) -> None:
    if not has_valid_integration_key(received, expected):
      raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized Moodle integration request"
      )
  return verify


def issue_browser_token(session_id: str, attempt_id: str, device_mode: str, secret: str) -> str:
  """Issue a short-lived HS256 token scoped to exactly one session."""

  now = datetime.now(UTC)
  return jwt.encode({
    "sessionId": session_id,
    "moodleAttemptId": attempt_id,
    "deviceMode": device_mode,
    "aud": BROWSER_AUDIENCE,
    "iat": now,
    "exp": now + BROWSER_TOKEN_LIFETIME
  }, secret, algorithm="HS256")


def decode_browser_token(token: str, secret: str) -> dict[str, Any]:
  """Verify a browser token with its fixed HS256 audience."""

  return jwt.decode(token, secret, algorithms=["HS256"], audience=BROWSER_AUDIENCE, options={
    "require": ["exp", "iat", "aud", "sessionId", "moodleAttemptId", "deviceMode"]
  })


def require_browser_claims(secret: str):
  """Create a dependency that translates all JWT failures to the legacy response."""

  async def verify(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
      raise HTTPException(status_code=401, detail="Invalid or expired browser token")
    try:
      return decode_browser_token(authorization.removeprefix("Bearer "), secret)
    except jwt.PyJWTError as error:
      raise HTTPException(status_code=401, detail="Invalid or expired browser token") from error
  return verify
