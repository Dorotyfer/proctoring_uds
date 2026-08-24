"""FastAPI-served HTML and immutable browser modules for the web UI."""

from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from starlette.templating import Jinja2Templates

from proctoring_api.config import canonical_http_origin


WEB_ROOT = Path(__file__).resolve().parent / "web"


class WebSecurityHeadersMiddleware:
  """Apply browser hardening without altering API CORS behavior."""

  def __init__(self, app, *, api_origin: str, moodle_origin: str | None) -> None:
    self.app = app
    frame_ancestors = moodle_origin or "'none'"
    self.headers = {
      "content-security-policy": (
        "default-src 'self'; base-uri 'none'; object-src 'none'; "
        "script-src 'self'; style-src 'self'; img-src 'self' blob:; "
        "media-src 'self' blob:; connect-src 'self' " + api_origin + "; "
        "form-action 'self'; frame-ancestors " + frame_ancestors
      ),
      "permissions-policy": "camera=(self)",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    }

  async def __call__(self, scope, receive, send):
    path = scope.get("path", "")
    protected = scope.get("type") == "http" and (
      path == "/panel" or path.startswith("/session/") or "/static/" in path
    )

    async def send_with_headers(message):
      if protected and message.get("type") == "http.response.start":
        headers = list(message.get("headers", []))
        existing = {name.lower() for name, _ in headers}
        headers.extend(
          (name.encode("ascii"), value.encode("ascii"))
          for name, value in self.headers.items()
          if name.encode("ascii") not in existing
        )
        message["headers"] = headers
      await send(message)

    await self.app(scope, receive, send_with_headers)


def register_web_ui(
  app: FastAPI,
  *,
  api_public_url: str,
  moodle_origin: str | None,
  public_base_path: str = "/proctoring"
) -> None:
  templates = Jinja2Templates(directory=WEB_ROOT / "templates")
  static_directory = WEB_ROOT / "static"
  asset_base = _public_asset_base(public_base_path)
  api_origin = canonical_http_origin(api_public_url)
  canonical_moodle = canonical_http_origin(moodle_origin) if moodle_origin else None

  app.add_middleware(
    WebSecurityHeadersMiddleware,
    api_origin=api_origin,
    moodle_origin=canonical_moodle
  )
  app.mount("/static", StaticFiles(directory=static_directory), name="web-static-direct")
  public_static_paths = {"/proctoring/static", asset_base}
  for index, path in enumerate(sorted(public_static_paths)):
    if path != "/static":
      app.mount(path, StaticFiles(directory=static_directory), name=f"web-static-public-{index}")

  @app.get("/session/{token}", response_class=HTMLResponse, include_in_schema=False)
  async def session_page(request: Request, token: str, mode: str | None = None, returnUrl: str | None = None):
    return templates.TemplateResponse(request, "session.html", {
      "api_base_url": api_public_url.rstrip("/"),
      "asset_base": asset_base,
      "mode": "monitor" if mode == "monitor" else "prepare",
      "return_url": _safe_moodle_url(returnUrl, canonical_moodle),
      "token": token,
    })

  @app.get("/panel", response_class=HTMLResponse, include_in_schema=False)
  async def panel_page(request: Request):
    return templates.TemplateResponse(request, "panel.html", {
      "api_base_url": api_public_url.rstrip("/"),
      "asset_base": asset_base,
      "moodle_origin": canonical_moodle or "",
    })


def _public_asset_base(public_base_path: str) -> str:
  path = public_base_path.rstrip("/")
  return f"{path}/static" if path and path != "/" else "/static"


def _safe_moodle_url(value: str | None, moodle_origin: str | None) -> str | None:
  if not value or not moodle_origin:
    return None
  try:
    parsed = urlsplit(value)
    if not parsed.hostname or parsed.username is not None or parsed.password is not None or parsed.fragment:
      return None
    candidate_origin = canonical_http_origin(f"{parsed.scheme}://{parsed.netloc}")
    if candidate_origin != moodle_origin:
      return None
    suffix = parsed.path or "/"
    if parsed.query:
      suffix = f"{suffix}?{parsed.query}"
    return f"{moodle_origin}{suffix}"
  except (TypeError, ValueError):
    return None
