# Moodle plugin implementation report

## Delivered

- Added the installable Moodle 4.3.3 local plugin at `apps/moodle/local/proctoring`.
- Added protected site settings for the HTTPS API URL, integration key, panel URL and panel JWT public key.
- Added the five required review and policy capabilities.
- Implemented a server-only JSON API client with five-second connect/total timeouts, TLS peer and host verification, an opaque correlation ID, and user-safe error mapping.
- Implemented session payload construction and attempt metadata persistence in `local_proctoring_attempt`. Only the external session UUID and expiry are stored; the short-lived browser token is returned to the caller and never written to Moodle.
- Added a deliberately hook-free quiz access-rule adapter boundary. It selects `seb` only when a supported caller reports native SEB as active, and otherwise selects `browser`.
- Added PHPUnit-compatible unit tests for API headers/options/error handling, session payload mode, and non-persistence of browser tokens.

## Verification

- `C:\xampp\php\php.exe -l` passed for all plugin PHP files.
- `git diff --check` passed.
- `pnpm --filter @proctoring/contracts test` passed: 6 tests.
- `pnpm --filter @proctoring/api test` passed: 6 tests.

The Moodle PHPUnit suite was not run because this worktree does not include a Moodle development root or its `vendor/bin/phpunit`. The plugin tests require installation into a Moodle 4.3.3 test instance before that command can run.

## Integration boundary

The implementation uses the Moodle 4.3 `quizaccess` settings/rule interface and the synchronous `mod_quiz\event\attempt_started` event. It does not patch Moodle core or register an unsupported pre-attempt hook.

## Review remediation (commit pending)

- Added `quizaccess_proctoring`, a Moodle 4.3 quiz-access rule with per-quiz enablement stored in `quizaccess_proctoring`.
- Registered the supported synchronous `mod_quiz\event\attempt_started` observer. Moodle creates the attempt ID, the observer creates exactly one external session before `startattempt.php` redirects, retains the launch token only in the current Moodle server session, and deletes the just-created attempt if session creation fails.
- Corrected payload extraction to the Moodle 4.3 `quiz_attempts.quiz` and `quiz.course` fields. API timestamps now use strict UTC `Z` form with milliseconds.
- Disabled cURL redirect following for authenticated API requests and strengthened success-response validation.
- Added course-scoped, five-minute RS256 panel links. They issue only capabilities held at the selected course; a report capability is required and evidence capability is only included when held.
- Added privacy providers for local attempt-linked metadata, including export and deletion, and the access-rule setting provider.
- Added an API contract test proving the timestamp form emitted by Moodle is accepted by the session route.

### Review remediation verification

- PHP syntax passed for all local and quiz-access plugin PHP files.
- Both plugin `install.xml` files parse successfully.
- `git diff --check` passed.
- `pnpm --filter @proctoring/contracts test` passed: 6 tests.
- `pnpm --filter @proctoring/api test` passed: 7 tests, including Moodle timestamp contract coverage.
