# Moodle-Native Proctoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a complete Moodle-native proctoring platform, including the student flow, monitoring, evidence, biometric checks, alerts, risk review and correction panel, without a Node.js API or external database.

**Architecture:** Build a new Moodle local plugin as the single backend and a quiz access-rule plugin as its Moodle integration boundary. Move browser functionality to Moodle AMD modules and use Moodle's database, File API, Privacy API, capabilities, events, scheduled tasks and AJAX External API.

**Tech Stack:** PHP 8.1+, Moodle 4.3.3+, Moodle Plugin APIs, MySQL/MariaDB through Moodle's $DB, Moodle File API, Moodle Privacy API, Moodle AMD JavaScript, HTML, CSS and the existing browser-side detection models.

**Spec:** docs/superpowers/specs/2026-09-01-moodle-native-proctoring-design.md

## Global Constraints

- Moodle is the only production runtime and source of truth.
- Do not modify the existing apps/ implementation until the native vertical slice is validated.
- Installable plugin paths are local/proctoring and mod/quiz/accessrule/proctoring.
- Moodle 4.3.3+ and PHP 8.1+ remain the compatibility floor.
- HTTPS is mandatory for camera, microphone and biometric activation.
- Browser code must never receive server secrets or direct database access.
- Sensitive captures and biometric descriptors must be encrypted before persistence.
- Evidence files must use Moodle's private File API and an authorized download callback.
- Every AJAX operation must validate parameters, login state, sesskey, context, capabilities and attempt ownership.
- The quiz rule must not alter grades automatically when an alert is created.
- Existing external plugins remain untouched until the native implementation passes its acceptance tests.
- Production must not require Node.js; Node.js is permitted only for development-time JavaScript tests and asset preparation.

---

## File map and ownership

The implementation workspace is moodle-native/.

### Local plugin

- Create: moodle-native/plugins/local/proctoring/version.php — plugin identity and version.
- Create: moodle-native/plugins/local/proctoring/settings.php — native settings without API URLs or integration keys.
- Create: moodle-native/plugins/local/proctoring/lib.php — navigation and Moodle hooks.
- Create: moodle-native/plugins/local/proctoring/db/install.xml — native schema.
- Create: moodle-native/plugins/local/proctoring/db/upgrade.php — schema upgrades.
- Create: moodle-native/plugins/local/proctoring/db/access.php — review and biometric capabilities.
- Create: moodle-native/plugins/local/proctoring/db/services.php — AJAX function declarations.
- Create: moodle-native/plugins/local/proctoring/db/tasks.php — retention and maintenance tasks.
- Create: moodle-native/plugins/local/proctoring/db/events.php — Moodle event observers.
- Create: moodle-native/plugins/local/proctoring/classes/domain/ — pure session, policy, alert and risk rules.
- Create: moodle-native/plugins/local/proctoring/classes/service/ — application use cases.
- Create: moodle-native/plugins/local/proctoring/classes/repository/ — $DB and File API access.
- Create: moodle-native/plugins/local/proctoring/classes/external/ — browser and panel AJAX functions.
- Create: moodle-native/plugins/local/proctoring/classes/privacy/provider.php — metadata, export and deletion.
- Create: moodle-native/plugins/local/proctoring/classes/task/ — scheduled task implementations.
- Create: moodle-native/plugins/local/proctoring/classes/event/ — plugin events and observers.
- Create: moodle-native/plugins/local/proctoring/classes/output/ — renderables and renderers.
- Create: moodle-native/plugins/local/proctoring/classes/form/ — policy and review forms.
- Create: moodle-native/plugins/local/proctoring/amd/src/ — AMD client modules.
- Create: moodle-native/plugins/local/proctoring/templates/ — Mustache panel and status templates.
- Create: moodle-native/plugins/local/proctoring/index.php — Moodle-native correction dashboard.
- Create: moodle-native/plugins/local/proctoring/session.php — authorized session detail page.
- Create: moodle-native/plugins/local/proctoring/evidence.php — authorized evidence response.
- Create: moodle-native/plugins/local/proctoring/model.php — versioned non-personal detection model assets.
- Create: moodle-native/plugins/local/proctoring/lang/en/local_proctoring.php and lang/es/local_proctoring.php.
- Create: moodle-native/plugins/local/proctoring/tests/ — PHPUnit coverage.

### Quiz access-rule plugin

- Create: moodle-native/plugins/quizaccess/proctoring/version.php.
- Create: moodle-native/plugins/quizaccess/proctoring/rule.php.
- Create: moodle-native/plugins/quizaccess/proctoring/launch.php.
- Create: moodle-native/plugins/quizaccess/proctoring/classes/observer.php.
- Create: moodle-native/plugins/quizaccess/proctoring/db/install.xml and db/upgrade.php.
- Create: moodle-native/plugins/quizaccess/proctoring/db/events.php.
- Create: moodle-native/plugins/quizaccess/proctoring/amd/src/launch.js.
- Create: moodle-native/plugins/quizaccess/proctoring/lang/en/quizaccess_proctoring.php and lang/es/quizaccess_proctoring.php.
- Create: moodle-native/plugins/quizaccess/proctoring/tests/ — rule and lifecycle tests.

### Development-only JavaScript test harness

- Create: moodle-native/tests/js/ — tests for browser modules that do not need a Moodle page.
- Create: moodle-native/package.json — test-only scripts and pinned development dependencies.
- Create: moodle-native/vitest.config.js — jsdom test configuration.
- Do not copy node_modules or .next into the installable plugins.

---

## Task 1: Create the native plugin skeleton and test harness

**Files:**
- Create all plugin metadata, language, directory and test-harness files listed above.
- Test: moodle-native/tests/php/lint_plugins.ps1
- Test: moodle-native/tests/js/smoke.test.js

**Interfaces:**
- Produces installable component names local_proctoring and quizaccess_proctoring.
- Produces AMD module names local_proctoring/* and quizaccess_proctoring/launch.

- [ ] Step 1: Write the failing PHP structure test.
- [ ] Step 2: Run pwsh -File tests/php/lint_plugins.ps1 and verify failure for missing files.
- [ ] Step 3: Add minimal plugin metadata with component names, Moodle requirement 2023100900 and version 2026090100.
- [ ] Step 4: Run PHP syntax checks and the structure test; expect PASS.
- [ ] Step 5: Commit with git commit -m "feat: scaffold native Moodle proctoring plugins".

## Task 2: Implement native schema, domain rules and repositories

**Files:**
- Modify: moodle-native/plugins/local/proctoring/db/install.xml
- Create: classes/domain/session_state.php
- Create: classes/domain/policy_validator.php
- Create: classes/domain/alert_policy.php
- Create: classes/domain/risk_score.php
- Create: classes/repository/session_repository.php
- Create: classes/repository/event_repository.php
- Create: classes/repository/alert_repository.php
- Create: classes/repository/evidence_repository.php
- Create: classes/repository/biometric_repository.php
- Create: classes/repository/risk_repository.php
- Test: moodle-native/plugins/local/proctoring/tests/domain_test.php
- Test: moodle-native/plugins/local/proctoring/tests/repository_test.php

**Interfaces:**
- session_state::can_transition(string $from, string $to): bool
- policy_validator::validate(array $policy): array
- alert_policy::should_alert(array $policy, string $type, int $count, int $windowseconds): bool
- risk_score::calculate(array $signals): array
- session_repository::find_by_attempt(int $attemptid): ?stdClass
- session_repository::create_for_attempt(stdClass $attempt, array $policy): stdClass
- session_repository::transition(int $sessionid, string $status): stdClass
- event_repository::insert_idempotent(int $sessionid, string $clienteventid, string $type, int $occurredat, array $metadata): stdClass

- [ ] Step 1: Write tests for valid/invalid state transitions, duplicate events and duplicate policy signal types.
- [ ] Step 2: Run vendor/bin/phpunit --testsuite local_proctoring --filter "session|policy" and verify failure.
- [ ] Step 3: Add Moodle XML tables for policies, sessions, events, alerts, evidence, evidence audit, biometric profiles, biometric versions, biometric checks, environment signals and risk scores.
- [ ] Step 4: Implement pure domain rules without $DB, globals or HTTP.
- [ ] Step 5: Implement repositories with Moodle $DB methods, named placeholders and normalized return values.
- [ ] Step 6: Run vendor/bin/phpunit --testsuite local_proctoring and expect PASS.
- [ ] Step 7: Commit with git commit -m "feat: add native proctoring persistence and domain rules".

## Task 3: Replace the external API with Moodle services

**Files:**
- Create: classes/service/session_service.php
- Create: classes/service/event_service.php
- Create: classes/service/incident_service.php
- Create: classes/external/start_attempt_session.php
- Create: classes/external/get_attempt_session.php
- Create: classes/external/activate_attempt_session.php
- Create: classes/external/complete_attempt_session.php
- Create: classes/external/record_session_events.php
- Create: classes/external/record_incident.php
- Modify: db/services.php
- Modify: settings.php
- Test: tests/external/session_service_test.php

**Interfaces:**
- session_service::start_attempt(int $attemptid): array
- session_service::get_attempt(int $attemptid): array
- session_service::activate_attempt(int $attemptid, array $input): array
- session_service::complete_attempt(int $attemptid): array
- event_service::record_batch(int $attemptid, array $events): array
- incident_service::record(int $attemptid, array $incident): array

Each external function must call require_login(), validate parameters through external_api::validate_parameters(), require sesskey, validate attempt owner/context and call one application service.

- [ ] Step 1: Write tests for unauthorized attempts and idempotent session creation.
- [ ] Step 2: Run focused external/session-service tests and verify failure.
- [ ] Step 3: Replace URL/key settings with native retention, capture, biometric and encryption settings.
- [ ] Step 4: Implement application services using Moodle attempts, quiz policy and repositories.
- [ ] Step 5: Declare AJAX functions in db/services.php with ajax enabled and explicit parameter/return structures.
- [ ] Step 6: Run vendor/bin/phpunit --testsuite local_proctoring and expect PASS without calls to the Node.js API.
- [ ] Step 7: Commit with git commit -m "feat: replace external proctoring API with Moodle services".

## Task 4: Move quiz lifecycle and access enforcement into the native core

**Files:**
- Modify: moodle-native/plugins/quizaccess/proctoring/rule.php
- Modify: classes/observer.php
- Modify: launch.php
- Modify: db/events.php
- Modify: db/install.xml
- Create: db/upgrade.php
- Test: tests/rule_test.php
- Test: tests/observer_test.php

**Interfaces:**
- quizaccess_proctoring::prevent_access(): string|false
- quizaccess_proctoring::setup_attempt_page(moodle_page $page): void
- observer::attempt_started(mod_quiz_event_attempt_started $event): void
- observer::attempt_finished(core_event_base $event): void

- [ ] Step 1: Write tests for unprepared, active and completed attempts.
- [ ] Step 2: Run vendor/bin/phpunit --testsuite quizaccess_proctoring and verify failure.
- [ ] Step 3: Remove external configuration checks and use local session status.
- [ ] Step 4: Create one local session per attempt, copy policy snapshot, set expiry and transition on completion.
- [ ] Step 5: Render a native preparation container and AMD initialization data without external redirects.
- [ ] Step 6: Run quizaccess PHPUnit and Behat smoke coverage; expect PASS.
- [ ] Step 7: Commit with git commit -m "feat: enforce proctoring through native Moodle quiz lifecycle".

## Task 5: Migrate the student preparation flow to Moodle AMD

**Files:**
- Create: amd/src/preparation.js
- Create: amd/src/camera.js
- Create: amd/src/consent.js
- Create: amd/src/enrollment.js
- Create: amd/src/liveness.js
- Create: amd/src/identity_document.js
- Create: amd/src/session_api.js
- Create: amd/src/event_buffer.js
- Create: amd/src/incident_buffer.js
- Create: templates/preparation.mustache
- Create: templates/status.mustache
- Create: styles.css
- Create: tests/js/preparation.test.js
- Create: tests/js/camera.test.js
- Create: tests/js/event_buffer.test.js

**Interfaces:**
- preparation.start(config): Promise<void>
- camera.request(): Promise<MediaStream>
- camera.capture_jpeg(video): string|null
- session_api.get_attempt(attemptid): Promise<object>
- session_api.activate_attempt(attemptid, payload): Promise<object>
- event_buffer.create(attemptid, sender): object

- [ ] Step 1: Write tests for camera denial, model-load failure, liveness, document capture, offline buffering and retry ordering.
- [ ] Step 2: Run pnpm --dir moodle-native test -- --run and verify failure.
- [ ] Step 3: Implement the Moodle AJAX transport with sesskey and a server-issued attempt nonce; never send secrets or JWTs.
- [ ] Step 4: Recreate consent, camera, enrollment, liveness and identity-document states with Mustache and AMD.
- [ ] Step 5: Serve approved non-personal models as versioned plugin assets and reject unknown filenames in model.php.
- [ ] Step 6: Run JavaScript tests and PHP lint; expect PASS.
- [ ] Step 7: Commit with git commit -m "feat: add Moodle-native student preparation flow".

## Task 6: Migrate continuous monitoring, incidents and evidence

**Files:**
- Create: amd/src/monitor.js
- Create: amd/src/face_analysis.js
- Create: amd/src/environment_analysis.js
- Create: amd/src/device_signals.js
- Create: amd/src/biometric_monitor.js
- Create: classes/service/evidence_service.php
- Create: classes/service/biometric_service.php
- Create: classes/service/crypto_service.php
- Create: classes/external/upload_evidence.php
- Create: classes/external/record_biometric_check.php
- Create: evidence.php
- Modify: classes/service/event_service.php
- Test: tests/evidence_service_test.php
- Test: tests/biometric_service_test.php
- Test: tests/js/monitor.test.js

**Interfaces:**
- crypto_service::encrypt(string $plaintext): array
- crypto_service::decrypt(array $ciphertext): string
- evidence_service::store(int $sessionid, string $kind, string $jpeg): stored_file
- evidence_service::authorize(int $userid, int $sessionid, string $fileid): stored_file
- biometric_service::enroll(int $userid, array $samples): array
- biometric_service::check(int $sessionid, array $samples): array

- [ ] Step 1: Write tests for encryption, 200 KB JPEG limits, private file authorization and biometric mismatch.
- [ ] Step 2: Run focused evidence and biometric tests and verify failure.
- [ ] Step 3: Implement AES-256-GCM with a protected server key, unique IV, authentication tag, hash, size and expiry metadata.
- [ ] Step 4: Store encrypted evidence in a private Moodle file area and authorize downloads by context, capability, session and status.
- [ ] Step 5: Port face, environment, device, SEB and biometric-monitor logic to AMD modules with bounded idempotent batches.
- [ ] Step 6: Record incidents, events and evidence metadata atomically; represent unavailable/pending evidence explicitly.
- [ ] Step 7: Run PHPUnit and JavaScript tests; expect PASS.
- [ ] Step 8: Commit with git commit -m "feat: add native monitoring evidence and biometric services".

## Task 7: Build the Moodle correction and alerts panel

**Files:**
- Create: index.php
- Create: session.php
- Create: classes/external/list_courses.php
- Create: classes/external/list_course_attempts.php
- Create: classes/external/get_session_detail.php
- Create: classes/external/review_alert.php
- Create: classes/external/reset_biometric_profile.php
- Create: classes/output/panel_page.php
- Create: classes/output/session_detail.php
- Create: templates/panel.mustache
- Create: templates/course_list.mustache
- Create: templates/attempt_list.mustache
- Create: templates/session_detail.mustache
- Create: templates/alert_row.mustache
- Create: amd/src/panel.js
- Create: amd/src/session_detail.js
- Test: tests/panel_authorization_test.php
- Test: tests/js/panel.test.js

**Interfaces:**
- panel_service::list_courses(context $context, array $filters): array
- panel_service::list_attempts(int $courseid, array $filters): array
- panel_service::get_session_detail(int $sessionid): array
- panel_service::review_alert(int $alertid, string $status, string $note): array
- panel_service::reset_biometric_profile(int $userid): array

- [ ] Step 1: Write tests for course scoping, session detail authorization and alert review recording.
- [ ] Step 2: Run focused panel tests and verify failure.
- [ ] Step 3: Implement panel-service capability checks for system and course contexts.
- [ ] Step 4: Render overview, courses, attempts, session detail, alerts, evidence, timeline, risk and biometric controls inside Moodle navigation.
- [ ] Step 5: Add server-side filters for query, dates, status, alert state, page and page size; cap page size at 100.
- [ ] Step 6: Allow only open-to-reviewed or open-to-dismissed transitions and record actor, note and timestamp without changing grades.
- [ ] Step 7: Run PHPUnit, JavaScript tests and a manual teacher/admin smoke test.
- [ ] Step 8: Commit with git commit -m "feat: add Moodle-native correction and alerts panel".

## Task 8: Add privacy, retention, audit and Moodle operations

**Files:**
- Create: classes/privacy/provider.php
- Create: classes/task/purge_expired_evidence.php
- Create: classes/task/retry_pending_evidence.php
- Create: classes/task/recalculate_risk.php
- Modify: db/tasks.php
- Modify: db/access.php
- Create: classes/event/evidence_accessed.php
- Create: classes/event/alert_reviewed.php
- Test: tests/privacy_provider_test.php
- Test: tests/task_test.php

**Interfaces:**
- provider::get_metadata(collection $items): collection
- provider::get_contexts_for_userid(int $userid): array
- provider::export_user_data(approved_contextlist $contextlist): void
- provider::delete_data_for_user(approved_contextlist $contextlist): void
- purge_expired_evidence::execute(): void

- [ ] Step 1: Write tests for export, deletion, expiration and audit records.
- [ ] Step 2: Run focused privacy and task tests and verify failure.
- [ ] Step 3: Describe every stored user field, context and file area in the Privacy API.
- [ ] Step 4: Export and delete structured metadata, encrypted files, biometric versions, events, alerts and audit rows.
- [ ] Step 5: Register daily purge, bounded pending-evidence retry and risk recalculation tasks; make them idempotent and auditable.
- [ ] Step 6: Emit Moodle events for evidence access and alert review without logging raw images or biometric descriptors.
- [ ] Step 7: Run PHPUnit and inspect scheduled task definitions; expect PASS.
- [ ] Step 8: Commit with git commit -m "feat: add Moodle privacy retention and audit operations".

## Task 9: Add advanced capabilities and optional adapters

**Files:**
- Create: amd/src/audio_monitor.js
- Create: amd/src/second_camera.js
- Create: classes/service/ocr_service.php
- Create: classes/service/live_review_service.php
- Create: adapter/README.md
- Create: adapter/seb.php
- Create: adapter/extension.php
- Test: tests/js/audio_monitor.test.js
- Test: tests/js/second_camera.test.js
- Test: tests/adapter_test.php

**Interfaces:**
- audio_monitor.start(MediaStream, callback): object
- second_camera.pair(int $sessionid, string $pairingcode): Promise<object>
- ocr_service::read_document(string $jpeg): array
- live_review_service::publish_signal(int $sessionid, array $signal): void
- adapter\\seb::collect_metadata(): array

- [ ] Step 1: Write tests for microphone denial, pairing expiration, OCR failure, SEB metadata validation and invalid extension signatures.
- [ ] Step 2: Run JavaScript and adapter tests and verify failure.
- [ ] Step 3: Add audio signals and OCR only when enabled by quiz policy and consent.
- [ ] Step 4: Add expiring second-camera pairing tied to the original session.
- [ ] Step 5: Add opt-in SEB and extension adapters; require signatures and prevent them from activating sessions independently.
- [ ] Step 6: Run focused tests and manual device checks.
- [ ] Step 7: Commit with git commit -m "feat: add optional advanced monitoring adapters".

## Task 10: Integration, migration and acceptance

**Files:**
- Create: moodle-native/tests/behat/proctoring_native.feature
- Create: moodle-native/tests/behat/steps/proctoring_steps.php
- Create: moodle-native/docs/installation.md
- Create: moodle-native/docs/configuration.md
- Create: moodle-native/docs/privacy.md
- Create: moodle-native/docs/feature-matrix.md
- Modify: moodle-native/README.md

**Interfaces:**
- Install paths remain local/proctoring and mod/quiz/accessrule/proctoring.
- No external API URL or integration key is required.
- The panel is reachable from Moodle navigation and never redirects to an external SSO service.

- [ ] Step 1: Write end-to-end scenarios for installation, configuration, consent, camera failure, activation, alerts, review, evidence authorization, export, deletion and retention.
- [ ] Step 2: Run Behat against a clean Moodle instance and verify failure until all slices are wired.
- [ ] Step 3: Document clean installation, coexistence with the external version, encryption-key provisioning, cron, backups and rollback.
- [ ] Step 4: Add a feature matrix marking native capabilities and features that require SEB, an extension, a second device or human supervision.
- [ ] Step 5: Run the complete PHPUnit, Behat and JavaScript verification suite; expect all tests to pass without external API configuration.
- [ ] Step 6: Commit with git commit -m "test: validate native Moodle proctoring vertical slice".

## Execution checkpoints

After Tasks 1–4, the system must install in Moodle and enforce a local session lifecycle without the Node.js API.

After Tasks 5–6, a student must be able to complete preparation, activate the attempt, generate signals and store protected evidence.

After Task 7, a teacher must be able to correct alerts and view only authorized course data inside Moodle.

After Task 8, privacy export/deletion, retention and audit must be operational.

Tasks 9–10 complete the advanced capability matrix and institutional acceptance. No production migration should occur before Task 10 passes.
