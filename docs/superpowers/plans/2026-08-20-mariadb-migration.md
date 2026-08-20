# MariaDB Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Node.js proctoring API and its distributable package run exclusively on MariaDB/MySQL 10.11 instead of PostgreSQL.

**Architecture:** Repositories will use a shared `mysql2/promise` pool factory while keeping their existing public interfaces. MariaDB-compatible migrations create the schema from scratch, and the migration runner executes each file transactionally. The root application and `entregables/aplicacion` remain byte-for-byte aligned for API source, dependencies and database migrations.

**Tech Stack:** Node.js 22, JavaScript ESM, Fastify, `mysql2`, MariaDB 10.11.14, Node test runner, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-20-mariadb-migration-design.md`

## Global Constraints

- Require MariaDB 10.11.14 or later and MySQL-compatible `DATABASE_URL` values using the `mysql:` protocol.
- Do not retain PostgreSQL runtime dependencies or SQL syntax in the API or distributable API.
- Keep Moodle and browser HTTP contracts unchanged.
- Use InnoDB, `utf8mb4`, UTC `DATETIME(3)`, `CHAR(36)` UUIDs, `JSON`, `BLOB`, and `VARCHAR(45)` audit IP addresses.
- Keep `entregables/aplicacion` synchronized with the root package.
- Do not migrate data; the target MariaDB schema is created from an empty database.

---

### Task 1: Establish MariaDB test helpers and dependency contract

**Files:**
- Modify: `apps/api/package.json`
- Modify: `package.json`
- Modify: `apps/api/test/config.test.js`
- Create: `apps/api/test/mysql-row.test.js`

**Interfaces:**
- Produces: `mysql2` as the only database client dependency.
- Produces: configuration acceptance for `mysql://` URLs without changing the `loadDatabaseConfig(environment)` return shape.

- [ ] **Step 1: Write failing configuration and row-normalization tests**

```js
test('accepts a MariaDB connection URL for migrations', () => {
  assert.deepEqual(loadDatabaseConfig({
    DATABASE_URL: 'mysql://proctoring:secret@127.0.0.1:3306/proctoring'
  }), {
    databaseUrl: 'mysql://proctoring:secret@127.0.0.1:3306/proctoring'
  });
});
```

Add a row-normalization test that asserts a JSON string becomes an object and a `Date` is emitted as ISO 8601.

- [ ] **Step 2: Run the focused tests to verify the new row test fails**

Run: `pnpm --filter @proctoring/api test -- test/mysql-row.test.js`

Expected: FAIL because the MariaDB row utility does not exist.

- [ ] **Step 3: Add `mysql2` and remove `pg`**

Replace the `pg` dependency with `mysql2`, update the lockfile with `pnpm install --lockfile-only`, and retain `DATABASE_URL` as the configuration property.

- [ ] **Step 4: Add the small row utility and run focused tests**

Create `apps/api/src/db/mysql-row.js` exporting `parseJson(value)` and `toIsoDate(value)`. `parseJson` must return objects unchanged, return `null` for nullish values, and parse JSON strings; `toIsoDate` must require a valid `Date` or parseable date and return `toISOString()`.

Run: `pnpm --filter @proctoring/api test -- test/config.test.js test/mysql-row.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/db/mysql-row.js apps/api/test/config.test.js apps/api/test/mysql-row.test.js
git commit -m "feat: add MariaDB database utilities"
```

### Task 2: Migrate session, alert, evidence and event repositories

**Files:**
- Create: `apps/api/src/db/mysql-pool.js`
- Modify: `apps/api/src/repositories/session-repository.js`
- Modify: `apps/api/src/repositories/alert-repository.js`
- Modify: `apps/api/src/repositories/evidence-repository.js`
- Modify: `apps/api/src/repositories/event-repository.js`
- Modify: `apps/api/test/sessions.test.js`
- Modify: `apps/api/test/events.test.js`
- Modify: `apps/api/test/evidence-service.test.js`
- Modify: `apps/api/test/alert-service.test.js`

**Interfaces:**
- Consumes: `createMysqlPool(databaseUrl, options?)`, `parseJson(value)`, `toIsoDate(value)`.
- Produces: The existing `createSessionRepository`, `createAlertRepository`, `createEvidenceRepository` and `createEventRepository` APIs backed by MariaDB.

- [ ] **Step 1: Write failing repository integration tests**

Add MariaDB-conditional tests (skip only when `TEST_DATABASE_URL` is absent) that create a session twice, create an event twice, serialize event metadata, enforce the 120-event limit, create evidence, and create an idempotent alert. Use an empty test database that has received migrations.

- [ ] **Step 2: Run the focused repository tests to verify failure**

Run: `TEST_DATABASE_URL=mysql://... pnpm --filter @proctoring/api test -- test/sessions.test.js test/events.test.js test/evidence-service.test.js test/alert-service.test.js`

Expected: FAIL because repositories import `pg` and PostgreSQL syntax.

- [ ] **Step 3: Implement shared pool and simple repository queries**

Create `createMysqlPool(databaseUrl, options = {})` using `mysql2/promise.createPool`, `dateStrings: false`, `decimalNumbers: true`, and `multipleStatements: options.multipleStatements === true`. Convert simple queries to `execute`, `?` markers and follow-up `SELECT` operations.

- [ ] **Step 4: Implement transactional event creation**

Use `pool.getConnection()`, `beginTransaction()`, `SELECT id FROM proctoring_sessions WHERE id = ? FOR UPDATE`, idempotency lookup, `received_at >= UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE`, insert JSON metadata, then commit. Roll back only after a transaction begins and release in `finally`.

- [ ] **Step 5: Run focused repository tests**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/mysql-pool.js apps/api/src/repositories apps/api/test
git commit -m "feat: persist proctoring data with MariaDB"
```

### Task 3: Migrate panel queries and database migration runner

**Files:**
- Modify: `apps/api/src/repositories/panel-repository.js`
- Modify: `apps/api/src/db/migrate.js`
- Modify: `apps/api/test/panel-authorization.test.js`
- Create: `apps/api/test/migrations.test.js`

**Interfaces:**
- Consumes: `createMysqlPool`, `parseJson`, `toIsoDate`.
- Produces: panel scope authorization using an `IN (?, ...)` clause and a migrator that records applied migration files in `proctoring_schema_migrations`.

- [ ] **Step 1: Write failing tests for panel scope and migration bookkeeping**

Test non-institutional scopes with multiple course IDs and an empty course list. Test that rerunning the migrator does not apply a migration twice and records the filename.

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `TEST_DATABASE_URL=mysql://... pnpm --filter @proctoring/api test -- test/panel-authorization.test.js test/migrations.test.js`

Expected: FAIL because the code uses PostgreSQL `ANY`, `FILTER`, `UPDATE ... FROM`, and `pg.Client`.

- [ ] **Step 3: Implement MariaDB panel SQL**

Build placeholder strings from validated `scope.courseIds`; return no rows for an empty non-institutional scope. Use `COUNT(alerts.id)` and `COALESCE(SUM(alerts.status = 'open'), 0)`. Replace alert review with an authorization `SELECT` followed by an `UPDATE` and final `SELECT` in one transaction.

- [ ] **Step 4: Implement the MariaDB migrator**

Use a `mysql2/promise` connection with `multipleStatements: true`. Create `proctoring_schema_migrations(name VARCHAR(255) PRIMARY KEY, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))`, read sorted files, and apply each file and its migration record inside one transaction.

- [ ] **Step 5: Run focused tests**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/repositories/panel-repository.js apps/api/src/db/migrate.js apps/api/test/panel-authorization.test.js apps/api/test/migrations.test.js
git commit -m "feat: migrate panel and schema runner to MariaDB"
```

### Task 4: Replace PostgreSQL schema with MariaDB schema

**Files:**
- Modify: `apps/api/src/db/migrations/001_sessions.sql`
- Modify: `apps/api/src/db/migrations/002_events.sql`
- Modify: `apps/api/src/db/migrations/003_preparation_alerts.sql`
- Modify: `apps/api/src/db/migrations/004_evidence_panel.sql`
- Modify: `apps/api/test/migrations.test.js`

**Interfaces:**
- Consumes: MariaDB migration runner from Task 3.
- Produces: all `proctoring_*` tables, keys and indexes required by the repositories.

- [ ] **Step 1: Extend the failing migration test**

After migrations, query `information_schema.tables`, `information_schema.statistics`, and `information_schema.key_column_usage` to assert the required tables, evidence composite indexes and cascading foreign keys exist.

- [ ] **Step 2: Run migration test to verify failure**

Run: `TEST_DATABASE_URL=mysql://... pnpm --filter @proctoring/api test -- test/migrations.test.js`

Expected: FAIL because PostgreSQL-only types and partial indexes cannot be applied by MariaDB.

- [ ] **Step 3: Convert each migration**

Use `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`; replace PostgreSQL types and defaults as specified. Define JSON defaults as `JSON_OBJECT()` where applicable. Replace partial indexes with `(deleted_at, session_id, created_at)` and `(deleted_at, expires_at)`. Use `BIGINT UNSIGNED AUTO_INCREMENT` for evidence audit IDs.

- [ ] **Step 4: Run migration test and inspect schema**

Run: `TEST_DATABASE_URL=mysql://... pnpm --filter @proctoring/api test -- test/migrations.test.js`

Then run: `mariadb "$TEST_DATABASE_URL" -e "SHOW TABLES;"`

Expected: PASS and all six proctoring tables are listed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/migrations apps/api/test/migrations.test.js
git commit -m "feat: define proctoring schema for MariaDB"
```

### Task 5: Synchronize distributable package and operating documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/runbooks/local-development.md`
- Modify: `docs/runbooks/mvp-acceptance.md`
- Modify: `docs/runbooks/support.md`
- Modify: `docs/runbooks/secret-rotation.md`
- Modify: `docs/mvp-implementation-plan.md`
- Modify: `scripts/create_user_manual_docx.py`
- Modify: `docs/manuals/Manual_de_implementacion_y_uso_Proctoring_UDS.docx`
- Modify: `entregables/aplicacion/**` matching all changed root application files and lockfile

**Interfaces:**
- Consumes: working root API and schema from Tasks 1–4.
- Produces: a distributable application and operator documentation that refer only to MariaDB/MySQL.

- [ ] **Step 1: Write a failing documentation consistency check**

Use `rg -n -i "postgresql|postgres:|pg\\b" README.md docs apps/api entregables/aplicacion` and list every intentional historical design document excluded from the migration scope.

- [ ] **Step 2: Update operations documentation and manual generator**

Document MariaDB 10.11.14 installation, a restricted database user, `mysql://` connection format, port 3306, backups with `mariadb-dump`, health semantics and production network restrictions. Regenerate the `.docx` using its existing script and verify the rendered document text mentions MariaDB instead of PostgreSQL.

- [ ] **Step 3: Synchronize the distributable package**

Copy each changed root `apps/api` source, tests, migrations, `package.json`, root package metadata, lockfile, README and applicable runbooks to their corresponding path under `entregables/aplicacion`. Do not alter Moodle ZIP bundles.

- [ ] **Step 4: Run consistency check**

Run the command from Step 1.

Expected: no PostgreSQL references in runtime code, active operations docs or `entregables/aplicacion`; historical approved MVP design/plan files may remain unchanged.

- [ ] **Step 5: Commit**

```bash
git add README.md docs scripts/create_user_manual_docx.py entregables/aplicacion pnpm-lock.yaml
git commit -m "docs: document MariaDB deployment"
```

### Task 6: Verify end-to-end MariaDB operation

**Files:**
- Modify: none unless verification exposes a defect.

**Interfaces:**
- Consumes: all completed migration tasks.
- Produces: verified installation and API health behavior against a real empty MariaDB 10.11.14 instance.

- [ ] **Step 1: Create a fresh test database and restricted account**

```sql
CREATE DATABASE proctoring_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'proctoring_test'@'localhost' IDENTIFIED BY 'replace-this-test-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, DROP ON proctoring_test.* TO 'proctoring_test'@'localhost';
```

- [ ] **Step 2: Run migrations twice**

Run: `DATABASE_URL=mysql://proctoring_test:replace-this-test-password@127.0.0.1:3306/proctoring_test pnpm --filter @proctoring/api migrate`

Expected: first run applies `001` through `004`; second run prints no applied migrations and exits 0.

- [ ] **Step 3: Run API and workspace test suites**

Run: `TEST_DATABASE_URL=mysql://proctoring_test:replace-this-test-password@127.0.0.1:3306/proctoring_test pnpm --filter @proctoring/api test`

Run: `pnpm test`

Expected: both commands exit 0.

- [ ] **Step 4: Verify health behavior against MariaDB**

Start the API with a valid `.env`, request `GET /health`, and assert HTTP 200 with `{ "status": "ok", "database": "available" }`. Stop MariaDB or point only the API at an invalid database port, then assert HTTP 503 with the existing degraded response.

- [ ] **Step 5: Commit verification fixes only if needed**

```bash
git add <affected-files>
git commit -m "fix: complete MariaDB compatibility"
```
