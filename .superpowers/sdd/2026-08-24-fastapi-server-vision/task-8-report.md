# Task 8 Report: Moodle payload and Ubuntu operations

## Commits

- Implementation and deferred test fixtures: `dcda595` (`feat: add Python production deployment operations`)
- Report: recorded in the commit containing this file.

## Delivered behavior

| Area | Result |
|---|---|
| Moodle policy | `session_manager` accepts an optional policy, defaults to `block`, validates only `block|allow_with_alert`, and includes `failurePolicy` in the existing session payload. The observer passes the stored setting without changing SSO, SEB resolution, attempt start, or completion behavior. |
| Runtime binding | Uvicorn binds only to a validated loopback host and trusts forwarded headers only from loopback Apache. The environment example exposes `API_HOST`, `API_PORT`, staging retention, Moodle origin, and the `/proctoring` panel base. |
| Staging cleanup | `proctoring-purge-staging` composes production repositories/storage, computes an aware UTC cutoff from `STAGING_RETENTION_MINUTES`, deletes only expired unreferenced staging objects, closes dependencies, and exits nonzero with a sanitized message on failure. |
| Operational CLI | Python entry points now cover API, worker, migrate, infrastructure check, evidence purge, staging purge, offline model install/verify, benchmark, deterministic fixtures, and bounded API load. Fixture records contain synthetic identifiers and `failurePolicy=block`; load errors are sanitized and redirects are rejected so the integration key is not forwarded. |
| systemd | API and worker are separate hardened services. Both verify the approved local manifest before start; the worker then performs its existing model preload before claiming jobs. Evidence retention, staging cleanup, and infrastructure checks have dedicated oneshot services and persistent timers. |
| Apache | `/proctoring/` and `/proctoring-api/` strip their prefixes and proxy to loopback Uvicorn. There is no `/_next/` mapping. Client-supplied forwarding headers are removed, request bodies are bounded, access logs omit query strings and referrers, and Apache does not overwrite FastAPI's route-specific CSP. |
| Ubuntu install | The installer requires capture inference, loopback binding, the fixed root-owned manifest path, a release-ready verified offline model set, and `/opt/proctoring/.deepface/weights`. It creates immutable releases, applies additive migrations and checks infrastructure before the atomic symlink switch, and restores the prior release if post-switch startup fails. Secrets/manifests are `0640`; model directories are `0750`. |
| Rollback | The target is resolved and restricted to `/opt/proctoring/releases`, its model files are verified before switching, and API/worker restart after the atomic symlink exchange. Additive database migrations are intentionally retained. |

No Docker workflow, Node removal, generated deliverable rebuild, Task 9 cleanup, Moodle grade, or Moodle attempt mutation was added.

## Test fixtures added

- Moodle PHPUnit coverage for the safe default, explicit `allow_with_alert`, and invalid values.
- Python settings coverage for loopback-only API binding and operational defaults.
- Deterministic Python fixture/load coverage for synthetic payloads, bounds, retries, and latency reporting.
- Python staging-purge coverage for cutoff/reference behavior, dependency closure, sanitized failure output, and nonzero exit.

## Verification evidence

Per the user's explicit instruction, no pytest, PHPUnit, PHP syntax, Python compilation, Apache config test, systemd analyzer, shell checker, installer, or load command was executed in this task. Test execution is deliberately deferred to the global final verification phase and is not claimed as passing.

The only non-runtime repository check executed before the implementation commit was `git diff --check`; it reported no whitespace errors. This is not a substitute for the deferred tests.

## Security and privacy behavior

- Neither operational CLI serializes frames, descriptors, encryption keys, JWTs, nor the Moodle integration secret.
- Pilot load failures are reduced to bounded codes; arbitrary exception text is not printed. HTTP redirects are rejected before sending a configured integration credential to another origin.
- Uvicorn is loopback-only and accepts proxy provenance only from loopback; Apache discards spoofable incoming forwarding headers.
- Apache's dedicated access-log format uses `%U` and omits `%q` and Referer, preventing SSO/session query tokens from reaching access logs.
- systemd uses a non-login `proctoring` account, `UMask=0077`, read-only system/home protections, private temporary/device namespaces, kernel/control-group protections, address-family restriction, and no-new-privileges.
- Model installation is offline-only and checksum-gated. API and worker startup perform verification but no installation or download.
- Configuration and model paths are fixed and permissioned; capture cannot be enabled by the installer without `INFERENCE_REQUESTED=true` and successful local manifest/weight verification.

## External release gates

- [ ] Replace the repository's intentionally non-release-ready model manifest entries with institutionally approved YuNet, SFace, FasNet, and SSDLite files and real SHA-256 values. No weight hash was invented in this task.
- [ ] On Ubuntu x86_64 with Python 3.12, run the installer from an offline model source and confirm `proctoring-models verify` and worker preload succeed without network access.
- [ ] Run focused and full Python 3.12 pytest suites, gated MariaDB/S3 tests, and inference tests only after approved weights are installed.
- [ ] Run Moodle PHP syntax/static checks and PHPUnit against the institution's supported Moodle release.
- [ ] Run `apache2ctl configtest`, `systemd-analyze verify` for all units, start timers/services, and inspect permissions/log output on the target Ubuntu host.
- [ ] Exercise migration, infrastructure check, both purge commands, atomic upgrade failure rollback, explicit rollback, and retention behavior against disposable MariaDB/S3 infrastructure.
- [ ] Execute `proctoring-load` against the approved non-production acceptance environment and record API/queue/inference SLA results; the CLI implementation alone is not SLA evidence.

## Deferred versus unimplemented

All requested Task 8 implementation items are present. Only environment-dependent execution and the user-directed global test phase are deferred. Approved model artifacts/hashes and the target Ubuntu/Moodle/MariaDB/S3 infrastructure are external inputs and remain real release gates.
