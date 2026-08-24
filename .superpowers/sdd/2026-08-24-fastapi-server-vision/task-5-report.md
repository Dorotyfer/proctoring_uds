# Task 5 Report: Durable analysis queue and browser API

## Delivered schema

| Migration/table | Contract |
| --- | --- |
| `009_analysis_queue.sql` | Additive migration after immutable `001`–`008`; creates one-use 120-second liveness challenges. |
| `proctoring_analysis_jobs` | `preparation`/`monitoring` jobs with only `queued`, `processing`, `completed`, `failed`, and `expired` states; owner leases, attempt count, bounded availability, and sanitized JSON result. |
| `proctoring_analysis_frames` | Encrypted staging metadata only: object key, IV/tag, hash, size, dimensions, cleanup state. No JPEG BLOB. |
| `proctoring_model_audit` | Version/action metadata without images or descriptors. |
| `proctoring_sface_profiles`, `proctoring_sface_checks` | Versioned SFace history, one-active-user generated-column unique key, and checks. Legacy Human rows are copied once by ciphertext/IV/tag SQL copy into revoked history; the legacy table is not modified, read by Python, decrypted, or deleted. |

## Route matrix

| Route | Ownership and response |
| --- | --- |
| `POST /v1/sessions/{id}/liveness-challenges` | Browser JWT session ownership; `201` with a center/turn/center challenge. |
| `POST /v1/sessions/{id}/preparation-analyses` | Browser JWT and multipart three JPEGs; consent and one-use challenge; `202`, `400`, `409`, or `429` with integer `Retry-After`. |
| `POST /v1/sessions/{id}/monitoring-frames` | Browser JWT and one multipart JPEG; `202`, `400`, or `429`. |
| `GET /v1/sessions/{id}/analyses/{analysisId}` | Browser JWT ownership and session-scoped job projection only; `404` on isolation miss. |
| `GET /v1/sessions/{id}/monitoring-status` | Browser JWT ownership; last processing timestamp, capacity availability, and ten-second interval. |

## Queue and staging behavior

`SqlAnalysisRepository.claim()` recovers expired 120-second leases, expires monitoring jobs older than two minutes, then claims a single eligible job in one MariaDB transaction with `FOR UPDATE SKIP LOCKED` and an atomic owner token. Lease renewal, completion, and failure all require the active owner token. Failure retries are capped at three attempts with 5/10/20-second bounded backoff; stale final attempts become failed.

`AnalysisQueueService` validates the decoded JPEG with Pillow before staging (exact MIME, complete JPEG framing, 200 KiB, and 320×240–1280×720). It encrypts each frame and stores only encrypted objects at unique `staging/{sessionId}/{analysisId}/...` keys. The transaction failure and idempotency losing paths delete their just-uploaded objects. The frame cleanup state remains a worker seam for retain-as-evidence or deletion.

## TDD evidence

RED commands observed:

```powershell
& .\.venv\Scripts\python.exe -m pytest apps/api/tests/test_analysis_queue.py -q
# ModuleNotFoundError: proctoring_api.services.analysis

& .\.venv\Scripts\python.exe -m pytest apps/api/tests/test_migrations.py -q
# expected 009_analysis_queue.sql was absent

& .\.venv\Scripts\python.exe -m pytest apps/api/tests/test_analysis_routes.py -q
# create_app() did not yet accept analysis_service
```

GREEN commands:

```powershell
& .\.venv\Scripts\python.exe -m pytest apps/api/tests/test_analysis_routes.py apps/api/tests/test_analysis_queue.py apps/api/tests/test_migrations.py -q
# 10 passed

& .\.venv\Scripts\python.exe -m pytest apps/api/tests -q
# 151 passed, 2 skipped
```

The existing MariaDB integration suite remains environment-gated by `TEST_DATABASE_URL`; those two tests were skipped in this workspace. Before deployment, run the migration runner and the integration marker against a disposable MariaDB instance, then exercise two independent workers claiming the same queued set.

## Commits and integration gates

- Code and tests: `88e366b` (`feat: add durable analysis queue API`).
- Report: recorded in the following documentation commit.
- Gate 1: apply migrations `001` through `009` in order under the advisory-lock runner.
- Gate 2: provision the S3/MinIO staging bucket and AES-256 evidence key before accepting upload traffic.
- Gate 3: run worker claim/renew/complete/fail ownership coverage against MariaDB before enabling worker service.
- Gate 4: Task 6 supplies inference and must use the worker cleanup seam; Task 7 supplies the browser UI.
