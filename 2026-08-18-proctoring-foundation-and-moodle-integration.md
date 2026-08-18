# Proctoring Foundation and Moodle Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first deployable vertical slice: a Moodle quiz creates a signed proctoring session and an authorized user can view that session in the separate administration panel.

**Architecture:** Use a TypeScript monorepo with a stateless Node.js API, PostgreSQL persistence, Redis-backed asynchronous job queue, and a Next.js panel. Moodle contains a lightweight local plugin and a `quizaccess` plugin; it owns Moodle permissions and calls the API through a server-to-server credential. The browser receives only short-lived signed session tokens.

**Tech Stack:** Node.js 22 LTS, TypeScript, pnpm workspaces, Fastify, Zod, PostgreSQL 16, Redis 7, BullMQ, Next.js, Vitest, Playwright, Moodle PHP, PHPUnit, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-08-18-moodle-proctoring-mvp-design.md`

## Global Constraints

- Moodle stays the source of truth for users, courses, quizzes and attempts.
- The proctoring platform never reads Moodle's database directly.
- The initial target is 1,000 active sessions; all API handlers must be stateless.
- The MVP supports Windows + SEB and mobile browser modalities with equal academic validity.
- Alerts are evidence for human review only; they must never change a Moodle grade automatically.
- Evidence is encrypted in transit and at rest; access to it is auditable.
- No video recording or emotion-based fraud scoring is part of this plan.

---

## File Structure

```text
apps/
  api/                         Fastify API and BullMQ workers
  admin/                       Next.js administration panel
  moodle/
    local/proctoring/          Moodle configuration and panel SSO plugin
    mod/quiz/accessrule/proctoring/  Moodle quiz access rule
packages/
  contracts/                   Shared JSON schemas and TypeScript types
infra/
  docker-compose.yml           Local PostgreSQL, Redis and object-storage emulator
docs/
  runbooks/local-development.md
```

Later plans, deliberately kept separate from this foundation, are: (1) browser/mobile capture and `@vladmandic/human`, (2) biometric enrolment and alert workers, (3) evidence storage and reporting, and (4) load testing and production deployment.

### Task 1: Create the reproducible local development environment

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `infra/docker-compose.yml`
- Create: `.env.example`
- Create: `docs/runbooks/local-development.md`
- Test: `infra/docker-compose.yml` health checks

**Interfaces:**
- Produces PostgreSQL at `postgres://proctoring:proctoring@localhost:5432/proctoring`, Redis at `redis://localhost:6379`, and S3-compatible storage at `http://localhost:9000` for all later tasks.

- [ ] **Step 1: Write the environment smoke-test script**

Create `scripts/check-infra.mjs` that connects to PostgreSQL, sends `PING` to Redis and requests the object-storage health endpoint. Exit with code `1` and a descriptive error if any dependency is unavailable.

```js
const checks = [checkPostgres(), checkRedis(), checkObjectStorage()];
const results = await Promise.allSettled(checks);
if (results.some((result) => result.status === 'rejected')) process.exit(1);
```

- [ ] **Step 2: Run the smoke test before infrastructure exists**

Run: `node scripts/check-infra.mjs`

Expected: FAIL because the local dependencies are not running.

- [ ] **Step 3: Create workspace and Docker Compose configuration**

Create a private pnpm workspace with packages `apps/*` and `packages/*`. Define PostgreSQL 16, Redis 7 and MinIO services with named volumes, explicit ports, non-default development credentials from `.env`, and Docker health checks. Add `infra:up`, `infra:down` and `infra:check` scripts.

```yaml
services:
  postgres:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U proctoring -d proctoring"]
  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
```

- [ ] **Step 4: Start dependencies and verify the smoke test**

Run: `pnpm infra:up && pnpm infra:check`

Expected: PASS; each dependency reports healthy.

- [ ] **Step 5: Document local startup and commit**

Document prerequisites, `.env` setup, startup, shutdown and log commands in `docs/runbooks/local-development.md`.

```bash
git add package.json pnpm-workspace.yaml infra .env.example scripts docs/runbooks/local-development.md
git commit -m "chore: add proctoring development environment"
```

### Task 2: Define the session and authorization contract

**Files:**
- Create: `packages/contracts/src/session.ts`
- Create: `packages/contracts/src/event.ts`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/test/session.test.ts`
- Modify: `packages/contracts/package.json`

**Interfaces:**
- Produces `CreateSessionInput`, `ProctoringSession`, `DeviceMode`, `PanelClaims` and `ProctoringEvent` schemas.
- Consumed by the API, Moodle plugins and Next.js panel.

- [ ] **Step 1: Write failing schema tests**

Test that a session accepts only `desktop_seb` or `mobile_browser`, requires non-empty Moodle IDs and rejects an expiry earlier than creation.

```ts
expect(() => CreateSessionInput.parse({ deviceMode: 'desktop' })).toThrow();
expect(CreateSessionInput.parse(validInput).deviceMode).toBe('mobile_browser');
```

- [ ] **Step 2: Run the contract tests to verify failure**

Run: `pnpm --filter @proctoring/contracts test`

Expected: FAIL because the package and schemas do not exist.

- [ ] **Step 3: Implement explicit Zod schemas**

Define immutable identifiers as strings and the following shape:

```ts
export const CreateSessionInput = z.object({
  moodleUserId: z.string().min(1),
  moodleCourseId: z.string().min(1),
  moodleQuizId: z.string().min(1),
  moodleAttemptId: z.string().min(1),
  deviceMode: z.enum(['desktop_seb', 'mobile_browser']),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
```

Define event types `camera_interrupted`, `face_absent`, `multiple_faces`, `face_out_of_frame`, `identity_check_failed`, `liveness_check_failed`, `page_visibility_changed`, `network_disconnected`, `network_reconnected` and `seb_event`.

- [ ] **Step 4: Run contract tests and typecheck**

Run: `pnpm --filter @proctoring/contracts test && pnpm --filter @proctoring/contracts typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the contract package**

```bash
git add packages/contracts
git commit -m "feat: define proctoring session contracts"
```

### Task 3: Implement API session creation and signed browser tokens

**Files:**
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/routes/sessions.ts`
- Create: `apps/api/src/services/session-service.ts`
- Create: `apps/api/src/services/token-service.ts`
- Create: `apps/api/src/repositories/session-repository.ts`
- Create: `apps/api/src/db/migrations/001_create_sessions.sql`
- Create: `apps/api/test/sessions.test.ts`

**Interfaces:**
- Consumes `CreateSessionInput` from `@proctoring/contracts`.
- Produces `POST /v1/internal/sessions` with `201 { session, browserToken }`.
- Accepts only an internal Moodle API key in `X-Moodle-Integration-Key`.
- Produces a 15-minute JWT containing `sessionId`, `moodleAttemptId`, `deviceMode`, `aud: "proctoring-browser"` and `exp`.

- [ ] **Step 1: Write failing API tests**

Create tests for valid creation, invalid device mode, missing integration key and an expired browser token.

```ts
const response = await app.inject({ method: 'POST', url: '/v1/internal/sessions', headers: validHeaders, payload: validInput });
expect(response.statusCode).toBe(201);
expect(response.json().browserToken).toEqual(expect.any(String));
```

- [ ] **Step 2: Run the API test to verify failure**

Run: `pnpm --filter @proctoring/api test -- sessions.test.ts`

Expected: FAIL because no Fastify app or endpoint exists.

- [ ] **Step 3: Implement migration, repository, token service and route**

Create a `proctoring_sessions` table with UUID primary key, Moodle identifiers, device mode, status, issued/expiry timestamps and creation timestamp. Use parameterized SQL only. Validate payload with the shared schema before persistence, issue the browser JWT after persistence, and return no Moodle integration secrets.

```ts
app.post('/v1/internal/sessions', { preHandler: requireMoodleKey }, async (request, reply) => {
  const input = CreateSessionInput.parse(request.body);
  const session = await sessionService.create(input);
  return reply.code(201).send({ session, browserToken: tokenService.issueBrowserToken(session) });
});
```

- [ ] **Step 4: Run focused and full API tests**

Run: `pnpm --filter @proctoring/api test -- sessions.test.ts && pnpm --filter @proctoring/api typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the session API**

```bash
git add apps/api packages/contracts
git commit -m "feat: create signed proctoring sessions"
```

### Task 4: Add Moodle configuration and quiz access plugins

**Files:**
- Create: `apps/moodle/local/proctoring/version.php`
- Create: `apps/moodle/local/proctoring/settings.php`
- Create: `apps/moodle/local/proctoring/classes/api_client.php`
- Create: `apps/moodle/local/proctoring/db/access.php`
- Create: `apps/moodle/mod/quiz/accessrule/proctoring/version.php`
- Create: `apps/moodle/mod/quiz/accessrule/proctoring/rule.php`
- Create: `apps/moodle/mod/quiz/accessrule/proctoring/lang/en/quizaccess_proctoring.php`
- Create: `apps/moodle/mod/quiz/accessrule/proctoring/tests/rule_test.php`

**Interfaces:**
- Consumes Moodle attempt, quiz, course, user and device-mode inputs.
- Calls `POST /v1/internal/sessions` only from the Moodle server.
- Produces a proctoring launch URL carrying the short-lived `browserToken`; never exposes the Moodle integration key to the browser.

- [ ] **Step 1: Write a failing PHPUnit test for the access rule**

Test that the rule blocks an attempt without an active proctoring session and permits it after a mocked API client returns a valid session.

```php
$messages = $rule->prevent_new_attempt(1, $attempt);
$this->assertContains('Proctoring validation is required before starting.', $messages);
```

- [ ] **Step 2: Run the Moodle test to verify failure**

Run from a Moodle development installation: `vendor/bin/phpunit --testsuite quizaccess_proctoring`

Expected: FAIL because the plugin is not installed.

- [ ] **Step 3: Implement plugin settings, capabilities and API client**

Store API base URL, integration key and panel URL in Moodle admin settings. Implement `local_proctoring\\api_client::create_session(array $input): array` with Moodle's cURL wrapper, a 5-second timeout, TLS verification, request correlation ID and error mapping. Define capabilities for reports, alerts, policies and biometric evidence.

- [ ] **Step 4: Implement the quiz access rule**

Implement `quizaccess_proctoring` to determine device mode, create a session before the attempt begins, persist only the returned session UUID and expiry in Moodle attempt metadata, and produce a clear user message if validation cannot be completed. Do not alter quiz grades.

- [ ] **Step 5: Run PHP tests and install validation**

Run: `vendor/bin/phpunit --testsuite quizaccess_proctoring`

Expected: PASS. Then install both plugins into a disposable Moodle instance and verify settings appear under Site administration.

- [ ] **Step 6: Commit the Moodle plugins**

```bash
git add apps/moodle
git commit -m "feat: add Moodle proctoring session integration"
```

### Task 5: Implement panel SSO, roles and course-scoped session listing

**Files:**
- Create: `apps/api/src/routes/panel-auth.ts`
- Create: `apps/api/src/routes/panel-sessions.ts`
- Create: `apps/api/src/services/authorization-service.ts`
- Create: `apps/admin/app/sso/consume/page.tsx`
- Create: `apps/admin/app/sessions/page.tsx`
- Create: `apps/admin/lib/api.ts`
- Create: `apps/api/test/panel-sessions.test.ts`
- Create: `apps/admin/e2e/sessions.spec.ts`

**Interfaces:**
- Consumes a short-lived signed Moodle panel token with `moodleUserId`, `capabilities`, `courseIds` and expiry.
- Produces `GET /v1/panel/sessions` filtered by the token's allowed courses.
- Produces one administrative view and one teacher view from the same API; authorization is enforced server-side.

- [ ] **Step 1: Write failing authorization tests**

Seed sessions in two courses. Assert a teacher token for course A never receives course B, while an institution-report capability receives both.

```ts
expect(response.json().items.map((item) => item.moodleCourseId)).toEqual(['course-a']);
```

- [ ] **Step 2: Run the authorization tests to verify failure**

Run: `pnpm --filter @proctoring/api test -- panel-sessions.test.ts`

Expected: FAIL because panel-token verification and query scoping do not exist.

- [ ] **Step 3: Implement SSO token verification and query scoping**

Reject missing, expired or malformed panel tokens. In the repository query, add the authorized course IDs as parameterized filters unless the capability `proctoring:view_institution_reports` is present. Return only session metadata at this stage, not biometric evidence.

```ts
if (!claims.capabilities.includes('proctoring:view_institution_reports')) {
  query.whereIn('moodle_course_id', claims.courseIds);
}
```

- [ ] **Step 4: Implement minimal panel pages**

The SSO consumer stores the session in secure HTTP-only cookie handling supplied by the Next.js server route. The sessions page renders device mode, status, course, attempt ID, creation time and alert count. It displays an explicit empty state for teachers without assigned courses.

- [ ] **Step 5: Run API and browser tests**

Run: `pnpm --filter @proctoring/api test -- panel-sessions.test.ts && pnpm --filter @proctoring/admin test:e2e -- sessions.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit the panel authorization slice**

```bash
git add apps/api apps/admin apps/moodle
git commit -m "feat: add course-scoped proctoring reports"
```

### Task 6: Verify the vertical slice and document handoff

**Files:**
- Create: `docs/runbooks/foundation-acceptance.md`
- Modify: `README.md`
- Test: `apps/api/test/vertical-slice.test.ts`

**Interfaces:**
- Verifies the published contract from Tasks 2–5 with no direct Moodle database access.

- [ ] **Step 1: Write a failing end-to-end API test**

Use a test database to create a Moodle-originated session, exchange a panel token, and assert that a course-scoped teacher sees only the linked session.

```ts
expect(teacherSessions.items).toHaveLength(1);
expect(teacherSessions.items[0].moodleAttemptId).toBe('attempt-42');
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm --filter @proctoring/api test -- vertical-slice.test.ts`

Expected: FAIL until all foundation interfaces are connected.

- [ ] **Step 3: Complete configuration and test fixtures needed by the vertical slice**

Add deterministic test credentials and database cleanup. Do not add biometric processing, image uploads or automatic grading.

- [ ] **Step 4: Run all foundation checks**

Run: `pnpm lint && pnpm test && pnpm typecheck && pnpm infra:check`

Expected: PASS.

- [ ] **Step 5: Write acceptance runbook and commit**

Document plugin installation, Moodle settings, API environment variables, a Windows/SEB session test, a mobile session test, teacher report verification and administrator report verification.

```bash
git add README.md docs/runbooks apps packages infra
git commit -m "docs: add foundation acceptance runbook"
```

## Plan Self-Review

- **Spec coverage in this plan:** Moodle integration, separate API/panel, session flow, device modes, RBAC, audit-ready authorization boundary, CPU-first asynchronous architecture, and 1,000-session horizontal-scaling foundations are covered.
- **Deferred by deliberate separate plans:** capture with `@vladmandic/human`, enrolment/liveness/identity comparison, image evidence encryption and retention workflows, alert scoring, load testing and deployment topology.
- **Placeholder scan:** no incomplete tasks, generic error-handling steps or undefined interfaces remain.
- **Type consistency:** session and event schema names are defined in Task 2 and consumed consistently in Tasks 3–6.
