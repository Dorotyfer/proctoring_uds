# FastAPI Server-Side Vision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Fastify, Next.js, React, pnpm, and Human.js with a Python 3.12 FastAPI application and server-side computer vision while preserving Moodle, SSO, MariaDB, S3, evidence, and authorization.

**Architecture:** FastAPI serves HTTP and static pages; separate Python workers consume MariaDB jobs whose encrypted frames live temporarily in S3. DeepFace/SFace/YuNet/FasNet handles face identity and liveness; torchvision SSDLite handles people and configured objects.

**Tech Stack:** Python 3.12, FastAPI, Uvicorn, Pydantic 2, SQLAlchemy 2, asyncmy, boto3, cryptography, PyJWT, Jinja2, DeepFace, PyTorch/torchvision, pytest, HTTPX, Selenium, Moodle PHP/PHPUnit.

**Spec:** `docs/superpowers/specs/2026-08-24-fastapi-server-vision-design.md`

## Global Constraints

- No Node.js, npm, pnpm, Fastify, Next.js, React, Zod, or Human.js in the final runtime, build, test, or deliverable.
- Keep Moodle's internal session routes and panel SSO route compatible; preserve HS256 claims, course scopes, evidence authorization, and existing public paths.
- Preserve migrations 001-007, historical data, AES-256-GCM wire format, MariaDB, S3/MinIO, and the legacy biometric table for rollback.
- Never store raw images or embeddings in logs, Moodle, browser persistence, or MariaDB BLOB job payloads.
- No continuous video, no emotion inference, no automatic grading or attempt mutation.
- Use only free dependencies; exclude paid licenses and AGPL. Record exact package/model versions, source, license, and SHA-256.
- Use TDD for every behavior: record RED and GREEN commands in the task report.

---

### Task 1: Python foundation, configuration, and contracts

**Produces:** installable `apps/api` Python package, typed configuration, Pydantic contracts, `/health`, static application factory, pytest baseline, and license inventory.

- [ ] Add failing tests for required environment values, secret/key validation, URL normalization, session/event contracts, failure-policy defaulting, and health responses.
- [ ] Run focused pytest and record the expected missing-module failures.
- [ ] Create `pyproject.toml`, package layout, configuration, models/enums, app factory, and `/health` with dependency injection.
- [ ] Pin Python dependencies without installing inference models at import time; add model/package license manifest and offline-weight configuration.
- [ ] Run focused and full Python tests, then commit.

### Task 2: Sessions, events, MariaDB repositories, and Moodle compatibility

**Consumes:** Task 1 configuration/contracts/app factory. **Produces:** compatible internal/browser session and event routes plus SQLAlchemy repositories and migration CLI for 001-007.

- [ ] Add failing route/service/repository tests for idempotent create, integration-key auth, token issuance, status, completion, browser ownership, event validation/rate limits, and `failurePolicy`.
- [ ] Implement async MariaDB engine, row mapping, raw-SQL migration runner, repositories, services, JWT dependencies, and routes.
- [ ] Preserve exact camelCase JSON and existing HTTP codes used by Moodle and the browser.
- [ ] Run focused and full Python tests, then commit.

### Task 3: AES-GCM, S3 evidence, retention, and historical compatibility

**Consumes:** Task 2 sessions/repositories. **Produces:** compatible encrypted evidence storage, audit, content tokens, cleanup CLI, and readiness checks.

- [ ] Add failing tests using fixed Node-compatible ciphertext/IV/tag fixtures, corrupt ciphertext, S3 failure/retry, authorization, audit, and retention cases.
- [ ] Implement AES-256-GCM adapters, S3 service, evidence repository/service, three bounded retries, purge command, `/health/ready`, and infrastructure-check command.
- [ ] Ensure no evidence metadata is committed if object upload fails and no secrets appear in responses/logs.
- [ ] Run focused and full Python tests, then commit.

### Task 4: Moodle panel SSO, CSRF, course authorization, and panel API

**Consumes:** Tasks 1-3 auth/storage/repositories. **Produces:** every existing panel endpoint, cookie session, CSRF protection, server-side course scopes, and evidence access.

- [ ] Add failing tests for valid/forged/expired Moodle SSO, cookie claims, CSRF, institutional/course scopes, pagination/filtering, review permissions, evidence isolation, and biometric reset.
- [ ] Implement SSO exchange, secure cookie, `/me`, course/session queries, alert review, evidence access/content, logout, and reset routes.
- [ ] Add a random CSRF claim, expose it only from `/me`, and require `X-CSRF-Token` plus exact Origin on mutable panel routes.
- [ ] Run focused and full Python tests, then commit.

### Task 5: Additive analysis schema, durable queue, and browser analysis API

**Consumes:** Tasks 1-4. **Produces:** migrations 008+, liveness challenges, SFace profile history, durable analysis jobs, staging objects, analysis polling, and monitoring status.

- [ ] Add failing tests for migrations from 001-007, legacy-profile history, one active SFace version, challenge expiry/consumption, job idempotency, leases, retries, per-session limits, stale expiry, and backpressure.
- [ ] Implement additive SQL migrations and queue/staging repositories using `SKIP LOCKED`, 120-second leases, three attempts, and two-minute monitoring expiry.
- [ ] Implement challenge, preparation upload, monitoring upload, analysis poll, and monitoring status routes using multipart JPEGs and browser JWT ownership.
- [ ] Validate JPEG magic bytes, decoded dimensions 320x240..1280x720, and 200 KB maximum before staging.
- [ ] Run focused and full Python tests, then commit.

### Task 6: DeepFace/SSDLite adapters and inference worker

**Consumes:** Task 5 queue/storage/contracts. **Produces:** lazy model adapters, worker loop, liveness/enrollment/verification, environment analysis, alerts, and model audit.

- [ ] Add failing deterministic tests for face absence/multiplicity/frame, center-turn-center landmarks, anti-spoof, medoid descriptor, SFace match/mismatch, SSDLite classes/thresholds, two-of-three confirmation, and worker retry/failure policy.
- [ ] Implement lazy DeepFace adapter with SFace/YuNet/FasNet, cosine threshold, encrypted float32 descriptors, and 60-second monitoring verification.
- [ ] Implement lazy SSDLite320 adapter for person >=0.70 and cell phone/laptop/tv/book >=0.60.
- [ ] Implement worker claiming, model preload, staging decryption, interval/alert retention, normal-frame deletion, audit metadata, and `analysis_unavailable` behavior.
- [ ] Add offline model download/checksum command and mixed-workload benchmark reporting the worker-count formula.
- [ ] Run focused tests; run inference integration only when approved weights are installed; run full non-model suite and commit.

### Task 7: Replace Next.js/React with FastAPI-served web UI

**Consumes:** Tasks 1-6 HTTP contracts. **Produces:** `/session/{token}`, `/panel`, static CSS/ES modules, camera flow, polling, monitoring, IndexedDB event retry, and accessible panel UI.

- [ ] Add failing Selenium/HTTP tests for page headers, challenge flow, three-frame multipart submission, polling, monitoring cadence/backpressure, network recovery, SSO panel navigation, review, logout, and course isolation.
- [ ] Implement Jinja templates and focused vanilla JavaScript modules for camera, API, preparation, monitoring, event queue, and panel rendering.
- [ ] Reuse the existing minimal CSS visual language; set CSP, frame-ancestors, Permissions-Policy, no-store, referrer, and nosniff headers.
- [ ] Keep images out of IndexedDB and retain only the newest pending monitoring frame in memory.
- [ ] Run Selenium/HTTP and full Python tests, then commit.

### Task 8: Moodle payload, Ubuntu deployment, operational CLI, and proxy

**Consumes:** Tasks 1-7. **Produces:** Moodle failure-policy propagation, Apache config, systemd units/timers, operational commands, and updated environment example.

- [ ] Add failing PHPUnit/pytest fixture tests proving `failurePolicy` is sent and defaults safely.
- [ ] Modify only the Moodle session payload path needed to send `block|allow_with_alert`; preserve SSO and attempt flow.
- [ ] Add systemd API/worker/cleanup units, Apache mappings without `/_next/`, installation scripts/runbook, and CLI commands for migrate/check/purge/fixtures/load.
- [ ] Verify service hardening, model preloading/checksums, secrets, proxy headers, and rollback instructions.
- [ ] Run Python tests and available Moodle static/PHPUnit checks, then commit.

### Task 9: Remove Node, rebuild deliverables/docs, and run final acceptance

**Consumes:** Tasks 1-8. **Produces:** Python-only repository/deliverables and final verification evidence.

- [ ] Delete Node backend/frontend/contracts, root Node manifests/lockfiles, Human models, and stale Node deliverables only after parity tests pass.
- [ ] Update README, architecture, runbooks, privacy/support/incident guides, implementation plans a-h, and the generated DOCX manual for Python server-side inference.
- [ ] Rebuild Moodle ZIPs and the application deliverable with Python sources, locked requirements, units, templates, static assets, and license inventory.
- [ ] Run full pytest, Selenium, PHP syntax/PHPUnit when available, clean-install validation, migration compatibility, secret scan, and `rg` checks proving no Node toolchain remains.
- [ ] Run or provide executable load acceptance for 1,000 registered profiles and 100 concurrent sessions: API p95 <=500 ms, preparation p95 <=20 s, queue p95 <=15 s/p99 <=30 s, zero lost jobs, retries <1%, and no cross-course access or grade mutation.
- [ ] Commit final cleanup and evidence.
