# Task 7 Report: FastAPI-served vanilla web UI

## Commits

- Code and deferred test fixtures: `06b742a` (`feat: serve secure vanilla browser UI`)
- Report: recorded in the commit containing this file.

No Node command, build step, Sites scaffold, CDN, inline script, or inline style was introduced.

## File matrix

| Responsibility | Files | Contract |
|---|---|---|
| Settings/runtime | `config.py`, `main.py`, `app.py` | Adds typed canonical `MOODLE_ORIGIN`, safe `PANEL_URL` with `/proctoring` default, derives the public asset prefix, and composes the web UI without changing API CORS allowlists. |
| Pages/security | `web.py`, `web/templates/*.html` | Serves `GET /session/{token}` and `GET /panel`; mounts assets at direct `/static`, required `/proctoring/static`, and the configured public prefix. Adds CSP, `frame-ancestors`, camera-only Permissions-Policy, no-referrer, nosniff, and no-store to pages/assets. |
| Session API/token | `web/static/js/api.js`, `session-bootstrap.js` | Reads the token once from the bootstrap element, removes that element, decodes only the owned session ID, keeps the token in memory, and sends the bearer token only to the configured API. |
| Camera/preparation | `camera.js`, `preparation.js` | Requires explicit consent, obtains a real stream, renders exact server challenge steps, captures three 640x480 JPEG blobs at bounded quality and <=200 KiB, sends the frozen multipart field names, polls to a terminal state, and refreshes the session. |
| Monitoring | `monitoring.js` | Retains the stream, uses the server ten-second interval with jitter, honors Retry-After, uses exact two-second confirmation follow-ups, polls results, and keeps only one newest pending JPEG Blob in memory during offline/429 backpressure. |
| Event retry | `event-queue.js` | Stores at most 200 idempotent structured event JSON records in a session-specific IndexedDB. Rejects visual/descriptor/token metadata and never writes a Blob, base64 image, descriptor, or bearer token. Retries on online and a five-second interval. |
| Panel API/rendering | `panel-api.js`, `panel.js`, `panel-bootstrap.js` | Initializes through `/me`, keeps CSRF in closure memory, sends exact `X-CSRF-Token` on every mutation with same-origin credentials, and renders course/session navigation, filters, review notes, evidence, reset confirmation, and logout through DOM/textContent APIs. |
| Presentation | `web/static/css/app.css` | Reuses the neutral/blue, border-based legacy language with responsive grids, accessible focus, labels, live status, and no shadows or gradients. |
| Final-test fixtures | `tests/test_web_pages.py`, `tests/selenium/test_session_camera.py`, `tests/selenium/README.md` | Provides HTTP header/return-URL/static-path fixtures and a Chrome fake-camera center/turn/center fixture that verifies three real bounded 640x480 JPEGs. |

## Flow matrix

| Flow | Browser behavior | Server boundary |
|---|---|---|
| Preparation bootstrap | DOM bootstrap is removed immediately; no browser storage receives the JWT. | Session ID is decoded only for URL ownership; the API still verifies JWT signature, audience, expiry, and ownership. |
| Consent/camera | Consent checkbox gates camera activation. Video, status, prompts, and capture controls are labeled and keyboard reachable. | Consent is also sent as exact `consentAccepted=true` and enforced server-side. |
| Liveness | Displays `center`, the issued `turn-left` or `turn-right`, then `center`; captures one JPEG per explicit action. | Uses the one-use challenge ID and exact `analysisId`, `consentAccepted`, `challengeId`, `centerStart`, `turn`, `centerEnd` multipart fields. |
| Queue/poll | Handles accepted work, 409 challenge expiry, and 429 Retry-After; polls queued/processing until completed/failed/expired. | No local liveness, biometric, object, or incident conclusion is generated. Only sanitized server results drive copy/state. |
| Continue | Refreshes the session and shows the Moodle link only for an active session and a return URL embedded after server validation. | Return URL origin must equal canonical `MOODLE_ORIGIN`; credentials/fragments/cross-origin values are rejected. |
| Monitor | Captures regularly, replaces the pending Blob when offline/saturated, uploads newest-only, polls, and schedules the two recommended two-second confirmation frames. | Server cadence/status and Retry-After remain authoritative. Images never enter IndexedDB or Web Storage. |
| Events | Emits network disconnect/reconnect, visibility, SEB, and camera interruption records with UUID idempotency keys. | Only bounded JSON reaches the existing event endpoint; retryable failures remain queued and terminal client/auth/session failures are dropped. |
| Panel | `/me` initializes profile and CSRF, then course pagination/search, course-scoped session filters, detail, review/note, evidence, reset, and logout. | 404 stays generic. Every mutable call carries closure-held CSRF; evidence opens with `noopener,noreferrer`. |

## Security matrix

| Control | Result |
|---|---|
| CSP | `default-src 'self'`; scripts/styles self-only; connect allows self plus the exact canonical API origin; media/image allow only required self/blob sources; object/base disabled; `frame-ancestors` is exact canonical Moodle origin or `'none'`. No unsafe-inline/eval. |
| Browser permissions | `Permissions-Policy: camera=(self)` only. |
| Navigation leakage | `Referrer-Policy: no-referrer`, no-store, nosniff, safe canonical Moodle return URL, and evidence tabs use noopener/noreferrer. |
| API isolation | Existing exact CORS middleware is unchanged. Page middleware applies only to HTML/static paths, not `/v1` API routes. |
| Panel mutations | Review, evidence access, biometric reset, and logout all use the exact in-memory `/me.csrfToken` as `X-CSRF-Token`; cookies use `credentials: same-origin`. |
| Browser privacy | No image, base64 image, descriptor, JWT, or CSRF token is written to IndexedDB/localStorage/sessionStorage. The only durable browser records are bounded event JSON. |
| Rendering | Untrusted panel/session values use `textContent`, attribute APIs, and element construction. No unsafe `innerHTML`. |

## Verification evidence in this task

The user explicitly deferred tests to the final verification phase. No HTTP,
Selenium, focused pytest, or full Python suite was executed here.

Executed checks:

```powershell
python -m compileall -q apps/api/src/proctoring_api apps/api/tests/test_web_pages.py apps/api/tests/selenium/test_session_camera.py
git diff --cached --check
```

Both exited `0`. The available interpreter was Python 3.11.9, so final release
verification must repeat compilation and all tests with the pinned Python 3.12
environment. Static scans found no `innerHTML`, localStorage, sessionStorage,
unsafe-inline, or unsafe-eval in the new UI.

## Explicit final-test checklist

- [ ] Install the package test extra in the pinned Python 3.12 environment and run `pytest apps/api/tests/test_web_pages.py -q`.
- [ ] Run `pytest apps/api/tests/selenium/test_session_camera.py -m selenium -q` with matching Chrome/driver; confirm fake-camera permission, exact prompts, three JPEG parts, 640x480 dimensions, and <=204800-byte frames.
- [ ] Add/run the final monitoring Selenium fixture for ten-second jitter, server interval override, 429 Retry-After, offline recovery, newest-only Blob replacement, analysis polling, and two exact two-second follow-ups.
- [ ] Add/run the final panel Selenium fixture for SSO, `/me`-first initialization, course search/pagination, filters/pagination, generic cross-course 404, detail, review note, evidence tab flags, reset confirmation, and logout.
- [ ] Inspect IndexedDB during offline monitoring: only event JSON may exist; confirm no Blob, data URL/base64, descriptor, JWT, or CSRF value exists in any browser storage.
- [ ] Verify page/static headers through direct `/static` and proxied `/proctoring/static` paths behind the Task 8 Apache configuration.
- [ ] Exercise an accepted Moodle callback URL with a query string and rejected cross-origin, credential-bearing, and fragment-bearing return URLs.
- [ ] Run the complete Python 3.12 suite, environment-gated MariaDB/S3 tests, `compileall`, and `git diff --check` after Task 8 proxy integration.

## Deferred versus unimplemented

All requested Task 7 production flows are implemented. Comprehensive monitoring
and panel Selenium fixtures and every test execution remain intentionally deferred
to the user-directed final test phase; they are listed above and are not claimed
as passing.
