# Control severity and behavior analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable Moodle control severity and an explainable per-session behavior risk analysis to the proctoring API and administrator panel.

**Architecture:** Moodle stores the quiz control level and sends it when creating a remote session. The API persists the level and computes a deterministic score from stored events and alerts through a small risk-analysis service. The panel reads the analysis as advisory metadata and displays the score, category, reasons, and control level without exposing biometric descriptors.

**Tech Stack:** JavaScript, PHP, MariaDB SQL, React/JSX, Vitest, Node test runner, Moodle plugin APIs.

**Spec:** `docs/superpowers/specs/2026-08-24-control-severity-behavior-analysis-design.md`

## Global Constraints

- Use only JS, HTML, CSS, Tailwind, Bootstrap, and PHP; no new runtime dependencies.
- Keep behavior scoring deterministic and explainable; do not change grades or issue automatic sanctions.
- Never return encrypted biometric descriptors, keys, or raw camera evidence in risk responses.
- Preserve existing teacher course scoping and institutional panel authorization.
- Use 2-space indentation and small single-responsibility functions.

---

### Task 1: Store and transmit the Moodle control level

**Files:**
- Modify: `apps/moodle/mod/quiz/accessrule/proctoring/rule.php`
- Modify: `apps/moodle/mod/quiz/accessrule/proctoring/db/install.xml`
- Modify: `apps/moodle/local/proctoring/classes/session_manager.php`
- Modify: `apps/api/src/repositories/session-repository.js`
- Modify: `apps/api/src/db/migrations/008_control_level.sql`
- Test: `apps/moodle/mod/quiz/accessrule/proctoring/tests/rule_test.php`
- Test: `apps/moodle/local/proctoring/tests/session_manager_test.php`
- Test: `apps/api/test/sessions.test.js`

**Interfaces:**
- Moodle policy field: `controllevel`, values `low|medium|high`, default `medium`.
- Session create payload field: `controlLevel`.
- API session field: `control_level` with default `medium` for existing rows.

- [ ] Write failing tests that save the selected Moodle control level, send it in the session payload, and persist the API value.
- [ ] Run the focused PHP and API tests and confirm they fail because the field and payload are absent.
- [ ] Add the Moodle quiz setting, XML install field, and session-manager payload mapping.
- [ ] Add the MariaDB migration and session repository insert/update mapping with `medium` fallback.
- [ ] Run the focused tests again and confirm they pass.
- [ ] Run Moodle PHP lint for all changed PHP files.
- [ ] Commit as `feat: add configurable proctoring control levels`.

### Task 2: Implement deterministic behavior risk analysis

**Files:**
- Create: `apps/api/src/services/session-risk-analysis-service.js`
- Modify: `apps/api/src/services/alert-service.js` only if a shared severity constant is needed
- Test: `apps/api/test/session-risk-analysis.test.js`

**Interfaces:**
- `analyzeSessionRisk({ controlLevel, events, alerts })` returns:
  `{ score, category, controlLevel, reasons, counts }`.
- `reasons` contains `{ code, label, points, count }` and is sorted by points descending.
- `counts` maps event/alert types to occurrence counts.

- [ ] Write failing tests for normal, medium-risk, high-risk, per-signal caps, suspicious SEB metadata, and score cap at 100.
- [ ] Run the focused test and confirm it fails because the service is missing.
- [ ] Implement the fixed scoring table and category thresholds from the approved spec.
- [ ] Ensure missing metadata and unknown event types contribute zero points.
- [ ] Run the focused test and confirm all cases pass.
- [ ] Commit as `feat: add explainable session risk analysis`.

### Task 3: Expose risk data through the authorized panel API

**Files:**
- Modify: `apps/api/src/repositories/panel-repository.js`
- Modify: `apps/api/src/routes/panel.js`
- Modify: `apps/api/src/server.js`
- Test: `apps/api/test/panel-authorization.test.js`

**Interfaces:**
- `GET /v1/panel/sessions/:sessionId` adds `controlLevel` and `risk`.
- `GET /v1/panel/courses/:courseId/sessions` adds `controlLevel`, `riskCategory`, and `riskScore` to each row.
- `risk` contains only the analysis result and reasons; it contains no descriptors or image bytes.

- [ ] Write failing authorization and response-shape tests for institutional and course-scoped reviewers.
- [ ] Run the focused panel tests and confirm the new fields are absent.
- [ ] Query events and alerts already loaded by `getSession`, pass them to the risk service, and map the session control level.
- [ ] Add bounded summary analysis to course-session rows using grouped event/alert counts.
- [ ] Preserve 404 behavior for sessions outside a teacher scope.
- [ ] Run all API tests and confirm they pass.
- [ ] Commit as `feat: expose session risk analysis in panel API`.

### Task 4: Add risk controls and analysis to the administrator panel

**Files:**
- Modify: `apps/web/components/PanelSessionDetail.jsx`
- Modify: `apps/web/components/AttemptList.jsx`
- Modify: `apps/web/app/styles.css`
- Test: `apps/web/test/panel-dashboard.test.jsx`

**Interfaces:**
- Session detail renders control level, score, category, reasons, and advisory text.
- Attempt rows render control level and risk category/score.
- Risk labels are Spanish: `Normal`, `Observación`, `Riesgo de fraude medio`, `Riesgo de fraude alto`.

- [ ] Write failing UI tests for risk summary and control-level badges.
- [ ] Run the focused UI test and confirm the new content is absent.
- [ ] Add compact, accessible risk summary and severity badges using existing neutral/accent styles.
- [ ] Add a clear notice that the analysis is advisory and requires human review.
- [ ] Run all web tests and the production build.
- [ ] Commit as `feat: display control severity and behavior risk`.

### Task 5: Deploy and verify end to end

**Files:**
- Modify: `apps/moodle/mod/quiz/accessrule/proctoring/version.php`
- Modify: `apps/moodle/local/proctoring/version.php` only if Moodle schema changes require it
- Update: Moodle test server plugin files and API/web services on the dedicated server

- [ ] Bump the Moodle plugin version for the new quiz field.
- [ ] Run full API tests, full web tests, web build, PHP lint, and `git diff --check`.
- [ ] Push the commits to `codex/proctoring-mvp-foundation-main`.
- [ ] Deploy API/web, run the build, restart services, and apply the Moodle upgrade.
- [ ] Verify API and web health endpoints, service status, and unauthenticated `401` behavior for the risk endpoint.
- [ ] Verify a new Moodle quiz exposes the control-level setting and a completed session displays the risk summary.
- [ ] Commit any version-only deployment adjustment and report the deployed commit.
