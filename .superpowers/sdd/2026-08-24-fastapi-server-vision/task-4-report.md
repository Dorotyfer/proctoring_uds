# Task 4 Report: Moodle Panel API

## Commits

- Code and tests: `56c963e` (`feat: add secure Moodle panel API`)
- Report: recorded after this file is committed.

## TDD evidence

### RED

The initial focused command was run with the Python 3.12 environment:

```powershell
& ..\..\.venv\Scripts\python.exe -m pytest tests\test_panel_auth.py tests\test_panel_routes.py tests\test_panel_repository.py -q
```

It failed with 16 failures: `ModuleNotFoundError` for both
`proctoring_api.panel_auth` and `proctoring_api.repositories.panel`, plus
`TypeError: create_app() got an unexpected keyword argument 'panel_repository'`.
This demonstrated that the auth service, scoped repository, and route composition
did not exist before implementation.

Two contract regressions were also written and observed RED before their minimal
implementations:

- The frozen `status` query name was ignored (`assert 'all' == 'active'`) before
  adding the FastAPI alias.
- Content delivery performed only one authorized repository lookup before the
  scoped token was extended to carry course scope and content rechecked it.

### GREEN

After implementation, the focused verification command was:

```powershell
& ..\..\.venv\Scripts\python.exe -m pytest tests\test_panel_auth.py tests\test_panel_routes.py tests\test_panel_repository.py tests\test_evidence.py -q
```

Result: `38 passed in 3.29s`.

Full verification was:

```powershell
& ..\..\.venv\Scripts\python.exe -m pytest -q
git diff --check
```

Result: `140 passed, 2 skipped in 4.24s`; `git diff --check` produced no
whitespace errors. No Node command was run.

## Route matrix

| Route | Auth and scope | Result |
|---|---|---|
| `GET /v1/panel/sso` | HS256 Moodle JWT; required audience, iat, exp, exact Moodle claims; exact panel-origin return URL | 302 with 30-minute `HttpOnly; Secure; SameSite=Lax; Path=/` cookie |
| `POST /v1/panel/logout` | panel cookie, exact `Origin`, constant-time CSRF | 204 and expired cookie |
| `GET /v1/panel/me` | panel cookie | sanitized user, scope flags, and CSRF token only |
| `GET /v1/panel/courses` | panel cookie; repository course scope | paged, parameterized course list |
| `GET /v1/panel/courses/{courseId}/sessions` | panel cookie and signed course or institution scope | paged, filtered course attempts; cross-course is 404 |
| `GET /v1/panel/sessions` | panel cookie; repository course scope | up to 200 scoped summaries |
| `GET /v1/panel/sessions/{sessionId}` | panel cookie; repository course scope | scoped detail; only alert evidence for evidence-capable users |
| `POST /v1/panel/alerts/{alertId}/review` | review capability, review-course SQL scope, exact Origin and CSRF | reviewed/dismissed alert or 404 |
| `POST /v1/panel/evidence/{evidenceId}/access` | evidence capability, course-authorized SQL lookup, exact Origin and CSRF | 60-second signed scoped content URL with bounded audit context |
| `GET /v1/panel/evidence/{evidenceId}/content` | short token validates audience, user, evidence ID, and signed course scope | decrypted bytes with no-store, nosniff, and content-disposition headers |
| `POST /v1/panel/biometric-profiles/{moodleUserId}/reset` | institution policy capability, exact Origin and CSRF | revokes active profile without reading descriptor data and audits reset |

## Production and SQL boundaries

- Runtime composition constructs the panel, evidence, and biometric repositories
  without connecting at import time.
- Empty non-institutional scopes return empty results without SQL execution.
- Course, session, detail, review, evidence-access, and evidence-content lookups
  carry authorized course scope into parameterized SQL. Content rechecks the
  scope embedded in the short signed token.
- Reset changes state and writes audit history; it neither decrypts descriptors
  nor deletes profile history.

## Environment-gated concerns

`tests/test_panel_mariadb_integration.py` is marked `integration` and skipped
unless `TEST_DATABASE_URL` is configured. The full run also skipped the existing
MariaDB/S3 integration smoke test because its `TEST_*` settings were unavailable.
These integration tests were not represented as executed MariaDB validation.

## Review round 1: canonical origins and bearer URL headers

### Commit

- Review code and tests: `4941fb7` (`fix: canonicalize panel origins and protect token URLs`)

### RED

The review regressions were run before implementation:

```powershell
& ..\..\.venv\Scripts\python.exe -m pytest `
  tests\test_config.py::test_settings_canonicalize_web_origin_like_browser_origin_serialization `
  tests\test_panel_routes.py::test_sso_sets_a_fixed_secure_lax_http_only_cookie_and_rejects_open_redirects `
  tests\test_panel_routes.py::test_canonical_origin_drives_cors_sso_csrf_and_the_complete_panel_client_sequence `
  tests\test_panel_routes.py::test_evidence_access_and_content_are_scoped_and_content_is_safe `
  tests\test_panel_routes.py::test_biometric_reset_and_logout_are_csrf_protected -q
```

Result: `7 failed, 1 passed`. The failures demonstrated raw host-case/default-port
origins in settings, failed SSO/CORS/CSRF behavior for a browser-canonical origin,
and absent `Referrer-Policy`/`Cache-Control` response headers. A second RED test
showed uncanonicalized `API_PUBLIC_URL`/`S3_ENDPOINT` origins.

### GREEN

Focused verification after the fix:

```powershell
& ..\..\.venv\Scripts\python.exe -m pytest `
  tests\test_config.py::test_settings_canonicalize_web_origin_like_browser_origin_serialization `
  tests\test_config.py::test_settings_canonicalize_the_origins_of_all_configured_http_urls `
  tests\test_panel_routes.py -q
```

Result: `13 passed in 1.54s`.

Fresh complete verification:

```powershell
& ..\..\.venv\Scripts\python.exe -m pytest -q
git diff --check
```

Result: `146 passed, 2 skipped in 3.67s`; `git diff --check` had no output.
No Node command was run.

### Security and client contract

- All configured HTTP(S) URL origins are serialized with lowercase scheme and
  host, default ports removed, non-default ports retained, credentials rejected,
  and IPv6 compressed/bracketed. `create_app` computes one canonical
  `WEB_ORIGIN`, then supplies it to CORS and the panel SSO/CSRF routes.
- SSO redirects and evidence-access/content responses carry
  `Referrer-Policy: no-referrer`. SSO and evidence-access responses are
  `Cache-Control: no-store`; evidence content preserves `private, no-store`.
- The cookie and clear-cookie both use `Path=/`, `HttpOnly`, `Secure`, and
  `SameSite=Lax`.
- The API contract regression executes the required Task 7 sequence:
  `/v1/panel/me` → read `csrfToken` → POST review with browser-canonical
  `Origin` and `X-CSRF-Token`. Task 7's vanilla-JS panel must use the same token
  on review, evidence access, biometric reset, and logout; it must not change
  the React client.
- Apache access-log query redaction for `token` and `accessToken` remains Task 8.
  This task blocks response referrer leakage now, but does not claim to redact
  proxy access logs.
