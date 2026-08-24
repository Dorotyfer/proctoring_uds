# Task 9 report: Python-only structure and deliverables

Date: 2026-08-24

## Commits

| Scope | Commit |
| --- | --- |
| Python package rename and runtime cleanup | `1993450d66da173c10e959287df65c47f767703e` |
| Active docs, reproducible builder and rebuilt deliverables | `e2b8099416f1170a340932bf973993e06c2b14e2` |
| User manual sub-block, owned by the root agent | `ae353fc` |

This report is committed separately after the two implementation commits.

## Structural result

- The import package is `apps/api/src/proctoring`; `proctoring_api` no longer exists as a package or compatibility shim.
- Distribution name remains `proctoring-api`; all Python entry points, imports, tests, systemd units and package data target `proctoring`.
- SQL migrations `001` through `010` live in `apps/api/migrations` and remain additive. Legacy schema/data contracts were not deleted.
- The active application is FastAPI/Python 3.12 with Jinja2, native browser modules and a Python worker.
- YuNet, SFace and FasNet cover server-side face analysis; SSDLite covers server-side person/object analysis. Browser inference and emotion analysis are excluded.

## Removed inventory

- root `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml`;
- complete `apps/web` application, its React/Next files, tests, generated model assets and Human.js model files;
- complete `packages/contracts` JavaScript package;
- `apps/api/package.json` and the legacy JavaScript API backend, routes, repositories, services, jobs, pilot scripts and JavaScript tests;
- ignored `node_modules` caches in the validated worktree paths;
- the previous mixed-runtime contents of `entregables/aplicacion`, including browser model weights.

All tracked removals are recoverable from Git. Legacy SQL tables/migrations and revoked biometric-history compatibility remain intentionally available for audit and rollback.

## Deliverable matrix

| Deliverable | Contents | Exclusions enforced |
| --- | --- | --- |
| `entregables/aplicacion` | Full `proctoring` Python source, `pyproject.toml`, migrations 001–010, model config example, license inventory, Apache/systemd files, Ubuntu scripts, Jinja2 templates, CSS and native ES modules | tests, caches, virtual environments, secrets, private keys, model weights, retired web runtimes and legacy package name |
| `entregables/moodle/local_proctoring` | Synchronized `apps/moodle/local/proctoring` tree | unrelated application source |
| `entregables/moodle/quizaccess_proctoring` | Synchronized quiz access plugin tree | unrelated application source |
| both Moodle ZIPs | Deterministic sorted entries under top-level `proctoring/` | invalid ZIP roots |

There was no Python lock or hashed requirements file in the source tree to copy. Dependency versions remain pinned in `apps/api/pyproject.toml`. Model weights and their approved hashes are release inputs and are not fabricated or committed.

## Reproducible build and validation

`scripts/build-deliverables.ps1` resolves every target beneath the source root, resets only the three expected deliverable directories, copies an allowlisted Python release, rebuilds both ZIPs and validates required/excluded paths. It rejects package manager manifests, retired frontend configs/extensions, weights, credentials, caches, tests, legacy package references and invalid Moodle ZIP roots.

Observed structural checks:

- `python -m compileall -q apps/api/src/proctoring apps/api/tests`: completed successfully after the package rename.
- `./scripts/build-deliverables.ps1`: completed successfully after the final source/doc update and printed `Python-only deliverable exclusions: OK`.
- repository file scan found no active `package.json`, pnpm manifest, `apps/web`, `packages/contracts`, `proctoring_api` package or Human model artifact.
- Moodle ZIP inspection found 13 local-plugin entries and 10 quiz-access entries, all rooted at `proctoring/`.

No pytest, PHPUnit, Selenium or retired-runtime command was executed, per the global instruction to defer all suites to final validation.

## Documentation and rollback

README, architecture, active runbooks, MVP plan and points A–H/shared contracts now describe only the FastAPI/server-inference architecture. Older Superpowers plans/specs are retained as historical records and carry an explicit superseded warning.

Application rollback is Git/release based. Database migrations are additive and legacy tables are preserved. The previous Node release is handled only as a server operation: stop and disable it, retain the immutable release/logs under restricted access for seven days, do not run it beside FastAPI, and remove it after stability approval.

## Final gates still pending

1. Run the complete Python unit/integration suite with MariaDB and S3 fixtures.
2. Run Selenium session/panel flows with fake camera and proxy public paths.
3. Run both Moodle plugin PHPUnit suites and installation/upgrade checks.
4. Provision institution-approved YuNet, SFace, both FasNet files and SSDLite weights; verify real SHA-256 values and `releaseReady` manifest state.
5. Run benchmark/load/accuracy gates on approved hardware and dataset; record measured SLA and model results.
6. Exercise Ubuntu install, health timers, rollback and seven-day legacy-release retirement in staging.

## Unimplemented items

No structural Task 9 item remains unimplemented. Runtime correctness, model approval and SLA evidence remain release gates rather than claimed results.
