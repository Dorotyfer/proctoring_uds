# Student camera flow report

## Delivered

- Added the `@proctoring/admin` Next.js application scaffold with a POST-only launch route.
- The launch route stores the browser token, session ID, liveness challenge ID and Moodle return URL in short-lived HTTP-only cookies. No browser token is placed in a URL.
- Added a client-only preparation flow that requests the camera, loads Human only in the browser, requires exactly one face fully in frame, and always stops camera tracks when unmounted.
- Added unique reference and liveness capture identifiers. The browser submits only `referenceCaptureId`, `liveness.challengeId` and `liveness.captureId` to the existing preparation submission endpoint; it never submits a local pass or readiness flag.
- Added a randomized two-action challenge using blink, turn-left and turn-right. Completion leaves the session submitted for server verification; it does not claim server readiness.

## Verification

- `pnpm --filter @proctoring/admin test` — 5 passing tests for denied permission, no face, multiple faces, face outside frame, and successful identifier submission with camera cleanup.
- `pnpm --filter @proctoring/admin build` — successful Next.js production build.
- `pnpm test` — 34 existing contracts, API and infrastructure tests passing.

## Moodle launch contract

`/sessions/launch` requires the existing Moodle form to POST `livenessChallengeId` alongside `browserToken`, `sessionId` and `returnUrl`. The current `prepare.php` form does not yet relay this UUID returned as `preparation.livenessChallengeId` by the session API, so that PHP relay must be added before a real preparation session can complete server verification.
