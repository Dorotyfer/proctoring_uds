# Moodle Proctoring MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a Moodle 4.3.3 proctoring MVP with web biometric controls, optional native SEB, encrypted evidence, human-review alerts, and course-scoped reports.

**Architecture:** Moodle owns identities, courses, quizzes, attempts, native SEB configuration and gradebook data. A PHP local plugin creates proctoring sessions through a server-to-server JavaScript API. The student web client performs lightweight facial checks locally; MySQL stores operational data and queued work, a local JavaScript worker processes jobs, and encrypted evidence is stored outside Apache's public directory without modifying grades.

**Tech Stack:** JavaScript, Node.js 22, Fastify, Zod, MySQL 8, Next.js, Vitest, Playwright, Moodle PHP 8.1+, PHPUnit, Apache, `@vladmandic/human`.

**Spec:** `docs/superpowers/specs/2026-08-18-moodle-proctoring-mvp-design.md`

## Global Constraints

- Moodle 4.3.3 is the source of truth for users, courses, quizzes and attempts.
- Use Moodle's native `quizaccess_seb`; do not install or maintain an external SEB quiz-access plugin.
- Browser proctoring requires no student-installed proctoring software.
- SEB is optional per quiz and requires the student-installed SEB application only when enabled.
- The API never reads Moodle database tables directly.
- Alerts are human-review evidence and never modify Moodle grades.
- Do not record continuous video or infer emotion.
- Encrypt evidence and biometric descriptors in transit and at rest; store local evidence outside Apache's public directory; audit every administrative evidence access.
- Apply course scope and capabilities in the API, not just in the UI.

---

## File Structure

```text
apps/
  api/                         Fastify API and local MySQL worker
  admin/                       Next.js student flow and reports panel
  moodle/local/proctoring/     Moodle 4.3.3 configuration and integration plugin
packages/contracts/            Zod request and response schemas
scripts/check-infra.mjs        Local dependency health check
docs/runbooks/                 Installation and acceptance guides
```

> **Environment revision (approved 2026-08-18):** The MVP uses only a MySQL connection configured in `.env`, a `scripts/check-infra.mjs` MySQL-only check, and a writable `EVIDENCE_STORAGE_PATH` outside every configured `APACHE_DOCUMENT_ROOTS` path. `APACHE_DOCUMENT_ROOTS` must list each Apache `DocumentRoot` and local `Alias` target. Tasks 3, 6 and 7 use MySQL; Task 6 claims jobs atomically from a MySQL `proctoring_jobs` table; Task 7 uses the encrypted local evidence path. Do not add external infrastructure dependencies.

### Task 1: Create the reproducible development environment

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.env.example`
- Create: `scripts/check-infra.mjs`
- Create: `docs/runbooks/local-development.md`
- Test: `scripts/check-infra.mjs`

**Interfaces:** Validates explicit MySQL settings from `.env`, plus an existing writable evidence path outside every `APACHE_DOCUMENT_ROOTS` public path.

- [ ] **Step 1: Write a failing dependency check**

Create `scripts/check-infra.mjs` with a `mysql2` connectivity check. It must reject when the MySQL connection from `.env` is unavailable.

```js
const results = await Promise.allSettled([checkMySql()]);
if (results.some((result) => result.status === 'rejected')) process.exit(1);
```

- [ ] **Step 2: Run the check before services exist**

Run: `node scripts/check-infra.mjs`
Expected: exit code `1` with unavailable dependency names.

- [ ] **Step 3: Add workspace and Compose services**

Create a private pnpm workspace. Add `mysql2`, document `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `EVIDENCE_STORAGE_PATH` and `APACHE_DOCUMENT_ROOTS`, and add the `infra:check` script. Reject missing or malformed database configuration. The evidence path must exist, be writable by the API/worker service account, be outside all configured Apache public paths, and deny Apache read access through the operating-system ACL.

- [ ] **Step 4: Verify the environment**

Run: `pnpm infra:check`
Expected: the MySQL check passes.

- [ ] **Step 5: Document and commit**

Document prerequisites, setup, logs, cleanup and Apache-safe evidence storage. Run `git add package.json pnpm-workspace.yaml scripts .env.example docs/runbooks/local-development.md` and commit `chore: add local proctoring environment`.

### Task 2: Define shared contracts and security boundaries

**Files:**
- Create: `packages/contracts/src/session.js`, `event.js`, `alert.js`, `token.js`, `index.js`
- Create: `packages/contracts/test/contracts.test.js`, `packages/contracts/package.json`

**Interfaces:** Produces `CreateSessionInput`, `SessionEventInput`, `PanelClaims`, `BrowserClaims`, `AlertType` and `DeviceMode` schemas used by Moodle, API and web clients.

- [ ] **Step 1: Write failing schema tests**

Test accepted modes `browser` and `seb`, required Moodle identifiers, timestamps in order and the exact event whitelist.

```js
expect(() => CreateSessionInput.parse({ deviceMode: 'desktop' })).toThrow();
expect(() => SessionEventInput.parse({ type: 'unknown' })).toThrow();
```

- [ ] **Step 2: Run the tests before implementation**

Run: `pnpm --filter @proctoring/contracts test`
Expected: fail because the package does not exist.

- [ ] **Step 3: Implement Zod schemas**

Define immutable string identifiers and the events `camera_interrupted`, `face_absent`, `multiple_faces`, `face_out_of_frame`, `identity_check_failed`, `liveness_check_failed`, `page_visibility_changed`, `network_disconnected`, `network_reconnected` and `seb_event`.

```js
export const DeviceMode = z.enum(['browser', 'seb']);
export const PanelClaims = z.object({
  moodleUserId: z.string().min(1),
  capabilities: z.array(z.string()),
  courseIds: z.array(z.string()),
  expiresAt: z.string().datetime()
});
```

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @proctoring/contracts test`
Expected: pass. Commit `feat: define proctoring contracts`.

### Task 3: Build the session API and signed tokens

**Files:**
- Create: `apps/api/src/app.js`, `routes/sessions.js`, `services/session-service.js`, `services/token-service.js`
- Create: `apps/api/src/repositories/session-repository.js`, `apps/api/src/db/migrations/001_sessions.sql`
- Create: `apps/api/test/sessions.test.js`

**Interfaces:** `POST /v1/internal/sessions` accepts `CreateSessionInput` with `X-Moodle-Integration-Key` and returns `{ session, browserToken }`. Browser tokens expire after 15 minutes.

- [ ] **Step 1: Write failing route tests**

```js
const response = await app.inject({ method: 'POST', url: '/v1/internal/sessions', headers, payload });
expect(response.statusCode).toBe(201);
expect(response.json().browserToken).toEqual(expect.any(String));
```

- [ ] **Step 2: Run focused tests**

Run: `pnpm --filter @proctoring/api test -- sessions.test.js`
Expected: fail because no app exists.

- [ ] **Step 3: Implement persistence, authentication and JWT issuance**

Create `proctoring_sessions` with UUID, Moodle identifiers, `device_mode`, `status`, issue/expiry timestamps and creation timestamp. Compare the integration key with a timing-safe method. Persist with parameterized SQL before issuing a signed browser token containing `sessionId`, `moodleAttemptId`, `deviceMode`, `aud: 'proctoring-browser'` and expiration.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @proctoring/api test -- sessions.test.js`
Expected: valid requests return 201; missing keys return 401; invalid payloads return 400. Commit `feat: create signed proctoring sessions`.

### Task 4: Implement the Moodle 4.3.3 local plugin

**Files:**
- Create: `apps/moodle/local/proctoring/version.php`, `settings.php`, `db/access.php`, `lang/en/local_proctoring.php`
- Create: `apps/moodle/local/proctoring/classes/api_client.php`, `classes/session_manager.php`, `classes/output/panel_link.php`
- Create: `apps/moodle/local/proctoring/tests/api_client_test.php`, `tests/session_manager_test.php`

**Interfaces:** `local_proctoring\\api_client::create_session(array $payload): array` calls the API from Moodle only. `session_manager::create_for_attempt($attempt, string $deviceMode): array` stores only the returned session UUID and expiry in Moodle attempt metadata.

- [ ] **Step 1: Write failing PHPUnit tests**

Mock Moodle's cURL wrapper and assert the integration key is sent only server-to-server, request failures are mapped to a user-safe exception, and the browser token is not stored in Moodle metadata.

- [ ] **Step 2: Run tests before plugin installation**

Run from the Moodle development root: `vendor/bin/phpunit --testsuite local_proctoring`
Expected: fail until the plugin is installed.

- [ ] **Step 3: Implement settings, capabilities and API client**

Store API URL, integration key, panel URL and JWT public key in protected Moodle settings. Define `local/proctoring:viewowncoursereports`, `reviewowncoursealerts`, `viewinstitutionreports`, `managepolicies` and `viewbiometricevidence`. Set five-second cURL timeout, TLS verification and a correlation ID.

- [ ] **Step 4: Implement quiz-start integration**

Register the supported Moodle event or quiz attempt hook. Determine `seb` only when Moodle's native SEB rule is active; otherwise use `browser`. Create the session before the attempt begins, attach the signed launch URL and block only when no valid session exists.

- [ ] **Step 5: Verify and commit**

Run: `vendor/bin/phpunit --testsuite local_proctoring`
Expected: pass. Install into disposable Moodle 4.3.3 and confirm settings and capabilities. Commit `feat: integrate Moodle proctoring sessions`.

### Task 5: Build browser preparation, enrolment and liveness checks

**Files:**
- Create: `apps/admin/app/session/[token]/page.jsx`, `components/PreparationFlow.jsx`, `CameraCheck.jsx`, `EnrollmentCheck.jsx`, `LivenessCheck.jsx`
- Create: `apps/admin/lib/camera.js`, `lib/human.js`, `lib/session-api.js`
- Create: `apps/admin/test/preparation-flow.test.jsx`, `apps/admin/e2e/preparation.spec.js`

**Interfaces:** `PreparationFlow` emits a successful identity result only after camera permission, a single face in frame, reference capture and randomized liveness challenge have passed.

- [ ] **Step 1: Write failing component and browser tests**

Mock `getUserMedia` and Human results. Cover denied camera, no face, two faces, passed capture and a failed liveness challenge.

```js
expect(await screen.findByText('Camera access is required.')).toBeInTheDocument();
expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ livenessPassed: true }));
```

- [ ] **Step 2: Run tests before implementation**

Run: `pnpm --filter @proctoring/admin test -- preparation-flow.test.jsx`
Expected: fail because the flow does not exist.

- [ ] **Step 3: Implement local camera and facial checks**

Load `@vladmandic/human` only in the browser. Stop camera tracks on navigation or failure. Require exactly one appropriately framed face. Generate a random two-step challenge from blink, turn-left and turn-right; do not reuse challenge results across sessions. Send only the required capture and result metadata through the session API.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @proctoring/admin test && pnpm --filter @proctoring/admin test:e2e -- preparation.spec.js`
Expected: pass. Commit `feat: add browser biometric preparation`.

### Task 6: Capture session events and create review alerts

**Files:**
- Create: `apps/api/src/routes/events.js`, `services/event-service.js`, `services/alert-service.js`, `workers/event-worker.js`
- Create: `apps/api/src/repositories/event-repository.js`, `alert-repository.js`, `db/migrations/002_events_alerts.sql`
- Create: `apps/admin/components/SessionMonitor.jsx`, `apps/admin/lib/event-buffer.js`
- Create: `apps/api/test/events.test.js`, `apps/admin/test/session-monitor.test.jsx`

**Interfaces:** `POST /v1/sessions/:sessionId/events` accepts an authenticated `SessionEventInput`. It stores the event, queues classification and creates a review alert without changing the Moodle attempt or grade.

- [ ] **Step 1: Write failing API and client tests**

Test `visibilitychange`, lost camera stream, offline queue/retry and explicit face-state changes. Assert an event cannot be submitted for another session token.

- [ ] **Step 2: Run tests before implementation**

Run: `pnpm --filter @proctoring/api test -- events.test.js`
Expected: fail because event routes do not exist.

- [ ] **Step 3: Implement event buffering and worker rules**

Buffer browser events in IndexedDB while offline and flush in chronological order when online. Queue classification jobs in MySQL and let the local worker claim them atomically. Create alerts for repeated face absence, multiple faces, camera interruption, liveness failure and page visibility change. Store an alert status of `open`, `reviewed` or `dismissed`; never call a Moodle grading endpoint.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @proctoring/api test -- events.test.js && pnpm --filter @proctoring/admin test -- session-monitor.test.jsx`
Expected: pass. Commit `feat: capture proctoring events and alerts`.

### Task 7: Store encrypted evidence and audit access

**Files:**
- Create: `apps/api/src/routes/evidence.js`, `services/evidence-service.js`, `services/crypto-service.js`
- Create: `apps/api/src/repositories/evidence-repository.js`, `audit-repository.js`, `db/migrations/003_evidence_audit.sql`
- Create: `apps/api/test/evidence.test.js`

**Interfaces:** `POST /v1/sessions/:sessionId/evidence` accepts JPEG captures with a browser token. `GET /v1/panel/evidence/:id` requires claims and writes an audit record before returning a short-lived download URL.

- [ ] **Step 1: Write failing evidence tests**

Test encrypted object upload, denied teacher access outside course scope, short-lived download URL and immutable audit record creation.

- [ ] **Step 2: Run focused tests**

Run: `pnpm --filter @proctoring/api test -- evidence.test.js`
Expected: fail because evidence services do not exist.

- [ ] **Step 3: Implement encryption and retention metadata**

Encrypt each object with AES-256-GCM using an envelope data key and store only object key, key reference, IV, auth tag, content type, capture reason and expiry metadata in MySQL. Write encrypted files under `EVIDENCE_STORAGE_PATH` outside Apache. Reject non-JPEG inputs and files larger than 2 MB. Put reference, periodic and alert captures in separate local prefixes.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @proctoring/api test -- evidence.test.js`
Expected: pass. Commit `feat: add encrypted evidence and access auditing`.

### Task 8: Implement panel SSO and course-scoped review UI

**Files:**
- Create: `apps/api/src/routes/panel-auth.js`, `routes/panel-sessions.js`, `routes/panel-alerts.js`, `services/authorization-service.js`
- Create: `apps/admin/app/sso/consume/page.jsx`, `app/sessions/page.jsx`, `app/sessions/[id]/page.jsx`
- Create: `apps/admin/components/SessionTable.jsx`, `AlertTimeline.jsx`, `EvidenceViewer.jsx`
- Create: `apps/api/test/panel-authorization.test.js`, `apps/admin/e2e/reports.spec.js`

**Interfaces:** Moodle panel tokens contain `moodleUserId`, `capabilities`, `courseIds` and expiry. `GET /v1/panel/sessions` returns only authorized course metadata; evidence is fetched separately under stricter capability checks.

- [ ] **Step 1: Write failing authorization tests**

Seed two course sessions and assert a teacher assigned course A sees only A, while a claim with `local/proctoring:viewinstitutionreports` sees both.

```js
expect(response.json().items.map((item) => item.moodleCourseId)).toEqual(['course-a']);
```

- [ ] **Step 2: Run tests before implementation**

Run: `pnpm --filter @proctoring/api test -- panel-authorization.test.js`
Expected: fail because panel routes do not exist.

- [ ] **Step 3: Implement server-side scope enforcement and UI**

Validate signed panel tokens, store panel authentication in secure HTTP-only cookies and filter SQL by authorized courses unless the institution capability is present. Render session status, mode, controls timeline, alert state and authorized evidence. Show an explicit empty state when a teacher has no assigned courses.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @proctoring/api test -- panel-authorization.test.js && pnpm --filter @proctoring/admin test:e2e -- reports.spec.js`
Expected: pass. Commit `feat: add scoped proctoring review panel`.

### Task 9: Verify the full Moodle flow and operational handoff

**Files:**
- Create: `apps/api/test/mvp-flow.test.js`, `apps/admin/e2e/mvp-flow.spec.js`
- Create: `docs/runbooks/moodle-installation.md`, `docs/runbooks/mvp-acceptance.md`, `docs/runbooks/privacy-retention.md`
- Modify: `README.md`

**Interfaces:** Provides a repeatable installation, acceptance and retention procedure for Moodle 4.3.3 administrators.

- [ ] **Step 1: Write a failing vertical-slice test**

Simulate a Moodle-originated session, browser preparation, event submission, alert creation, teacher review and denied access to a different course.

```js
expect(teacherSessions.items).toHaveLength(1);
expect(alert.gradeChanged).toBeUndefined();
```

- [ ] **Step 2: Run test before final wiring**

Run: `pnpm --filter @proctoring/api test -- mvp-flow.test.js`
Expected: fail until all interfaces are connected.

- [ ] **Step 3: Add deterministic fixtures and acceptance commands**

Create test keys, test courses and disposable storage buckets. Document local plugin installation, Moodle native SEB configuration, browser flow, evidence authorization, retention cleanup and alert review.

- [ ] **Step 4: Run all checks**

Run: `pnpm lint && pnpm test && pnpm typecheck && pnpm infra:check`
Expected: pass with all infrastructure healthy.

- [ ] **Step 5: Load-test and commit**

Run a documented k6 scenario with 1,000 simulated active sessions, capturing API latency, queue depth and retry rate. Commit `docs: add proctoring MVP acceptance runbook`.

## Plan Self-Review

- **Spec coverage:** Moodle integration, native optional SEB, browser preparation, liveness, identity, local facial controls, events, evidence encryption, alerts, auditing, scoped panel access and 1,000-session verification each map to Tasks 1–9.
- **No automatic grading:** Tasks 4, 6, 8 and 9 explicitly exclude grade mutation.
- **Type consistency:** Tasks 3–8 consume schemas defined in Task 2; Moodle creates sessions only through the Task 3 route.
- **Placeholder scan:** no deferred implementation markers or unspecified test steps remain.
