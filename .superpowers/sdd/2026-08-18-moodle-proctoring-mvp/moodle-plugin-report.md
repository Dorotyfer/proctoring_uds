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

## Deliberate limitation

No unsupported pre-attempt or quiz lifecycle hook was registered. Wiring `quiz_access_rule_adapter` into a verified Moodle quiz-access extension remains an installation/integration task, after confirming the host's supported callback point.
