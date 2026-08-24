# Task 6 Report: server-side vision and durable inference worker

## Delivered

- Added lazy worker-only model loading for DeepFace `0.0.100`, SFace, YuNet, FasNet, torchvision SSDLite320/MobileNetV3, and the pinned Python 3.12 Linux vision stack. API/package imports do not import `deepface`, `tensorflow`, `torch`, `torchvision`, or `cv2`.
- Added typed, redacted face results; exact one-face enforcement; anti-spoof enforcement; configurable direction-aware center/turn/center landmark liveness; normalized float32 SFace descriptors; cosine-medoid enrollment; versioned little-endian serialization; and AES-256-GCM descriptor encryption.
- Added SFace profile history/check/audit persistence with one active SFace profile per user, transactional history revocation, explicit rejection of legacy Human descriptors, the official DeepFace SFace/cosine threshold `0.593`, and model/detector/metric/threshold/latency metadata.
- Added SSDLite COCO filtering for person (`>=0.70`) and cell phone/laptop/tv/book (`>=0.60`) only. Multiple persons or a configured environment object produce `environment_intrusion`.
- Added durable 60-second SFace/interval cadence and three-observation confirmation state. An initial anomaly requests two follow-up observations at two-second intervals; an alert is emitted only after the same allowed anomaly occurs in at least two observations in the full three-observation window.
- Added a worker with 120-second repository leases, renewal during inference, encrypted S3 staging loads, plaintext size/hash validation, owner-token completion/failure, repository-owned three-attempt behavior, and final-attempt failure-policy effects.
- Added preparation activation, mismatch blocking/alerting, `block` versus `allow_with_alert` technical behavior, identity/interval/alert evidence handling, encrypted staging-object reuse, and normal-frame cleanup. No Moodle attempt or grade write exists in the inference path.
- Added additive migration `010_worker_monitoring_state.sql`; migration `009_analysis_queue.sql` remains unchanged. Migration 010 adds monitoring cadence/observations, the job-to-challenge reference, allowed inference event types, and an SFace-specific audit table referencing SFace profiles.
- Added `proctoring-worker`, `proctoring-models verify`, `proctoring-models install-from-local`, and `proctoring-benchmark`. Installation is offline-only and copies only manifest-approved files whose SHA-256 matches. Fake/no-weight benchmark output is marked invalid for SLA and reports throughput, p50/p95, peak RAM, 30% reserve, and `ceil(15 / mixed throughput per worker)`.

## TDD evidence

Representative RED observations:

```text
ModuleNotFoundError: proctoring_api.services.vision
ModuleNotFoundError: proctoring_api.services.monitoring
ModuleNotFoundError: proctoring_api.services.worker
ImportError: cannot import name build_deepface_adapter
AssertionError: final-attempt fallback did not clean staging frames
AssertionError: two observations confirmed before the full three-observation window
```

Each production slice was added only after its focused test failed for the missing behavior. Focused GREEN runs covered face cardinality/redaction, liveness, medoid/encryption/verification, object thresholds, confirmation/cadence, worker leases/retries/cleanup, preparation effects, model operations, and SQL seams.

Fresh broad verification before the final code commit:

```powershell
& .\.venv\Scripts\python.exe -m pytest apps/api/tests -q
# 208 passed, 4 skipped

& .\.venv\Scripts\python.exe -m pytest apps/api/tests -m "not inference" -q
# 208 passed, 3 skipped, 1 deselected

& .\.venv\Scripts\python.exe -m pytest apps/api/tests -m inference -q
# 1 skipped, 211 deselected

& .\.venv\Scripts\python.exe -m compileall -q apps/api/src/proctoring_api
# exit 0

git diff --check
# exit 0 (line-ending notices only)
```

After the coordinator requested prompt completion, the final confirmation-window and SFace-audit FK corrections received focused RED evidence and a syntax/JSON/diff check; the broad suite was not rerun after those two narrow corrections.

## Model and artifact matrix

| Component | Pin / model | Runtime behavior | Release state |
| --- | --- | --- | --- |
| DeepFace | `0.0.100` | Imported only by explicit worker preload; SFace/YuNet/FasNet prebuilt before claim | Linux wheel hash recorded |
| torch | `2.13.0` | Optional `vision` extra only | CPython 3.12 manylinux 2.28 x86_64 wheel hash recorded |
| torchvision | `0.28.0` | Local-state-dict SSDLite, `weights=None`, `weights_backbone=None`, `eval()`, inference mode | CPython 3.12 manylinux 2.28 x86_64 wheel hash recorded |
| OpenCV contrib headless | `4.14.0.94` | Worker-only YuNet runtime | CPython 3.12-compatible abi3 manylinux 2.28 x86_64 wheel hash recorded |
| YuNet | `2023mar` | Exact local manifest artifact required | Missing approved model SHA; release-blocking |
| SFace | `2021dec` | Exact local manifest artifact required | Missing approved model SHA; release-blocking |
| FasNet | MiniFASNetV2 + MiniFASNetV1SE | Both exact local artifacts required | Missing approved model SHAs; release-blocking |
| SSDLite COCO weights | `a79551df` filename | Exact local manifest artifact required | Missing approved model SHA; release-blocking |

Official package artifact hashes were obtained from the PyPI release JSON/files for the exact releases. Package provenance and licenses are recorded in `apps/api/licenses/inventory.json`. No model-weight hash was invented.

## Security and privacy behavior

- Raw JPEG bytes and descriptors are excluded from dataclass representations, exceptions, job results, model audit, and event/audit metadata.
- Staging ciphertext is decrypted only in worker memory and validated against the persisted plaintext SHA-256 and byte length.
- Descriptor plaintext uses a versioned format and is AES-256-GCM encrypted; algorithm checks prevent legacy Human ciphertext from being treated as SFace.
- Model startup performs no network download. The release-ready manifest, approved status, exact SHA-256, local files, and required model IDs are checked before heavyweight imports and before queue claim.
- Only `biometric_monitor_mismatch`, `environment_intrusion`, and `analysis_unavailable` can become monitoring inference alerts. No emotion, age, gender, race, demographic, Moodle attempt, or grade operation exists.

## Commits and gates

- Implementation and tests: `42b17f4` (`feat: add server vision inference worker`).
- Report: committed separately after this file.

Release gates that remain intentionally closed:

1. Acquire and approve the exact YuNet, SFace, both FasNet, and SSDLite model files; populate real SHA-256 values; set `releaseReady: true`; and install them under the configured `.deepface/weights` directory with `proctoring-models install-from-local`.
2. Run the gated inference test against those installed artifacts on Ubuntu CPython 3.12. No model-runtime integration was claimed in this weightless Windows workspace.
3. Run migration 010 and worker/effect integration against disposable MariaDB and S3/MinIO, including concurrent lease ownership and retained staging evidence.
4. Run `proctoring-benchmark` with real approved weights and representative preparation/monitoring frames. Fake output remains explicitly invalid for SLA sizing.

No Task 6 implementation item was deliberately deferred. The remaining items are deployment validation gates that require approved external artifacts or infrastructure unavailable in this workspace.
