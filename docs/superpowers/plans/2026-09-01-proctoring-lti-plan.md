# Proctoring Internal LTI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a Moodle-managed tool named **Proctoring** appear in **Más → Herramientas externas LTI** and open the authorized native panel or valid attempt flow.

**Architecture:** `local_proctoring` owns an idempotent registration service for Moodle’s standard LTI tool configuration. A local launch endpoint validates the signed LTI request, resolves the Moodle course/user context, and routes to the existing native panel or preparation flow. LTI is only an entry point; sessions, alerts, policies, and evidence remain in native Moodle tables.

**Tech Stack:** PHP 8.1+, Moodle 4.3.3+, Moodle `mod_lti` APIs, Moodle DB/XMLDB, PHPUnit, Behat, HMAC validation, Moodle capabilities.

**Spec:** `docs/superpowers/specs/2026-09-01-unified-moodle-proctoring-design.md`

## Global Constraints

- No external API URL, external database, Node.js service, or client-visible secret.
- Use Moodle’s standard LTI tool storage and course navigation.
- Register exactly one idempotent tool named `Proctoring`.
- LTI launches must validate nonce/timestamp/signature before resolving context.
- The launch endpoint must enforce Moodle capabilities before showing panel data.
- Do not create a second session, alert, policy, or evidence store.
- Preserve existing native panel URL `/local/proctoring/index.php`.

---

### Task 1: Define LTI configuration and registration contract

**Files:**
- Create: `moodle-native/plugins/local/proctoring/classes/service/lti_tool_service.php`
- Modify: `moodle-native/plugins/local/proctoring/settings.php`
- Modify: `moodle-native/plugins/local/proctoring/lang/es/local_proctoring.php`
- Modify: `moodle-native/plugins/local/proctoring/lang/en/local_proctoring.php`
- Test: `moodle-native/plugins/local/proctoring/tests/lti_tool_service_test.php`

**Interfaces:**
- `local_proctoring\service\lti_tool_service::ensure_registered(): array` returns `id`, `name`, `launchurl`, `visible`, and `usagecount`.
- `local_proctoring\service\lti_tool_service::status(): array` returns `registered`, `enabled`, `visible`, and `toolid`.
- `local_proctoring\service\lti_tool_service::disable(): void` disables only the Proctoring registration.

- [ ] **Step 1: Inspect the installed Moodle LTI API before coding**

Run on the Moodle checkout: `rg -n "function lti_add_type|lti_types|activitychooser|external tools" mod/lti lib admin`

Record the exact Moodle 4.5 function signature and fields used for a site-level external tool. Use that API rather than inserting guessed columns directly.

- [ ] **Step 2: Write the failing registration test**

```php
public function test_registration_is_idempotent_and_named_proctoring(): void {
    $first = $this->service->ensure_registered();
    $second = $this->service->ensure_registered();

    $this->assertSame('Proctoring', $first['name']);
    $this->assertSame($first['id'], $second['id']);
    $this->assertSame('/local/proctoring/lti/launch.php', parse_url($first['launchurl'], PHP_URL_PATH));
    $this->assertSame(1, $this->db->count_records('lti_types', ['name' => 'Proctoring']));
}
```

- [ ] **Step 3: Run the focused test and confirm failure**

Run: `php admin/tool/phpunit/cli/util.php --testcase=local_proctoring\tests\lti_tool_service_test`

Expected: FAIL because the registration service does not exist.

- [ ] **Step 4: Implement registration through Moodle’s LTI API**

Find an existing tool by a stable Proctoring marker, create it when missing, update its name/description/launch URL when present, set the selector visibility from `local_proctoring/lti_activitychooser`, and never create a duplicate. Use a generated secret stored only in the standard Moodle LTI record; never export it in `status()`.

- [ ] **Step 5: Add settings and translations**

Add the LTI enable, name, description, and activity chooser settings under the existing global **Proctoring** page. The default visible name is `Proctoring`, and the default launch URL is generated from `$CFG->wwwroot` rather than stored as a hardcoded domain.

- [ ] **Step 6: Run tests and commit**

Run: `php admin/tool/phpunit/cli/util.php --testcase=local_proctoring\tests\lti_tool_service_test`

```text
git add moodle-native/plugins/local/proctoring/classes/service/lti_tool_service.php moodle-native/plugins/local/proctoring/settings.php moodle-native/plugins/local/proctoring/lang moodle-native/plugins/local/proctoring/tests/lti_tool_service_test.php
git commit -m "feat: register native proctoring as LTI tool"
```

### Task 2: Implement signed internal LTI launch routing

**Files:**
- Create: `moodle-native/plugins/local/proctoring/lti/launch.php`
- Create: `moodle-native/plugins/local/proctoring/classes/service/lti_launch_service.php`
- Create: `moodle-native/plugins/local/proctoring/classes/domain/lti_request_validator.php`
- Modify: `moodle-native/plugins/local/proctoring/db/access.php`
- Modify: `moodle-native/plugins/local/proctoring/lang/es/local_proctoring.php`
- Modify: `moodle-native/plugins/local/proctoring/lang/en/local_proctoring.php`
- Test: `moodle-native/plugins/local/proctoring/tests/lti_request_validator_test.php`
- Test: `moodle-native/plugins/local/proctoring/tests/lti_launch_service_test.php`

**Interfaces:**
- `local_proctoring\domain\lti_request_validator::validate(array $request, string $consumersecret, int $now): array` returns `valid`, `userid`, `courseid`, `resourceid`, and `warnings`.
- `local_proctoring\service\lti_launch_service::launch(array $request): \moodle_url`.
- `local_proctoring\service\lti_launch_service::resolve_destination(array $context): \moodle_url`.

- [ ] **Step 1: Write signature and replay tests**

```php
private function signed_request(string $secret): array {
    $request = [
        'lti_message_type' => 'basic-lti-launch-request',
        'lti_version' => 'LTI-1p0',
        'oauth_consumer_key' => 'proctoring-internal',
        'oauth_signature_method' => 'HMAC-SHA1',
        'oauth_timestamp' => 1700000000,
        'oauth_nonce' => 'nonce-1',
        'user_id' => '2',
        'roles' => 'Instructor',
        'context_id' => '7',
        'resource_link_id' => 'quiz-41',
    ];
    $request['oauth_signature'] = $this->oauth_signature($request, $secret);
    return $request;
}

public function test_validator_rejects_invalid_signature(): void {
    $result = \local_proctoring\domain\lti_request_validator::validate(
        $this->signed_request('wrong-secret'),
        'real-secret',
        1700000000
    );

    $this->assertFalse($result['valid']);
    $this->assertContains('signature', $result['warnings']);
}

public function test_validator_rejects_stale_timestamp_and_missing_nonce(): void {
    $request = $this->signed_request('real-secret');
    $request['oauth_timestamp'] = 1690000000;
    unset($request['oauth_nonce']);

    $result = \local_proctoring\domain\lti_request_validator::validate($request, 'real-secret', 1700000000);

    $this->assertFalse($result['valid']);
    $this->assertContains('timestamp', $result['warnings']);
    $this->assertContains('nonce', $result['warnings']);
}
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `php admin/tool/phpunit/cli/util.php --testcase=local_proctoring\tests\lti_request_validator_test`

Expected: FAIL because the validator is missing.

- [ ] **Step 3: Implement request validation**

Validate `lti_message_type`, `oauth_consumer_key`, `oauth_signature_method`, nonce, timestamp within five minutes, required user/course/resource identifiers, and HMAC-SHA1 signature using Moodle’s exact OAuth normalization rules. Add the test helper `oauth_signature(array $request, string $secret): string` using the same RFC 5849 base-string normalization to produce valid fixtures. Reject unsigned or malformed requests before any user/course lookup.

- [ ] **Step 4: Implement launch destination resolution**

Resolve `roles` and capability context. Teachers/managers with `local/proctoring:viewowncoursereports` or system review capability go to `/local/proctoring/index.php?courseid=<id>`. A valid quiz attempt resource goes to the native preparation/attempt route. All other contexts receive Moodle’s permission exception.

- [ ] **Step 5: Implement the endpoint**

Bootstrap Moodle, load the stored Proctoring tool secret, validate the request, establish the Moodle user/context through the supported LTI path, require the appropriate capability, and redirect using `redirect($url)`. Do not call the panel renderer before validation and do not print secrets or request payloads.

- [ ] **Step 6: Run tests and commit**

Run: `php admin/tool/phpunit/cli/util.php --testcase=local_proctoring\tests\lti_request_validator_test --testcase=local_proctoring\tests\lti_launch_service_test`

```text
git add moodle-native/plugins/local/proctoring/lti/launch.php moodle-native/plugins/local/proctoring/classes/service/lti_launch_service.php moodle-native/plugins/local/proctoring/classes/domain/lti_request_validator.php moodle-native/plugins/local/proctoring/db/access.php moodle-native/plugins/local/proctoring/lang moodle-native/plugins/local/proctoring/tests/lti_request_validator_test.php moodle-native/plugins/local/proctoring/tests/lti_launch_service_test.php
git commit -m "feat: securely route internal proctoring LTI launches"
```

### Task 3: Make the tool available from Moodle course navigation

**Files:**
- Modify: `moodle-native/plugins/local/proctoring/lib.php`
- Modify: `moodle-native/plugins/local/proctoring/index.php`
- Modify: `moodle-native/plugins/local/proctoring/classes/output/panel_page.php`
- Modify: `moodle-native/plugins/local/proctoring/templates/panel_page.mustache`
- Modify: `moodle-native/plugins/local/proctoring/styles.css`
- Test: `moodle-native/tests/behat/proctoring_native.feature`

**Interfaces:**
- `local_proctoring_extend_navigation_course()` adds a normal course navigation link to the native panel only when the current user has a review capability.
- Panel accepts optional `courseid` and displays the scoped course context.

- [ ] **Step 1: Add the navigation test**

```gherkin
Scenario: Proctoring is listed as a course external tool
  Given I log in as "admin"
  And I am on the course page for "Curso de prueba"
  When I open the "Más" menu
  Then I should see "Herramientas externas LTI"
  When I follow "Herramientas externas LTI"
  Then I should see "Proctoring"
  And I should see "Mostrar en el selector de actividad"
```

- [ ] **Step 2: Run the scenario and confirm failure**

Run: `php admin/tool/behat/cli/util.php --profile=proctoring --suite=moodle-native/tests/behat/proctoring_native.feature`

Expected: FAIL because no LTI registration or scoped panel route exists.

- [ ] **Step 3: Register the tool during plugin upgrade and explicit admin synchronization**

Call `lti_tool_service::ensure_registered()` from the local plugin upgrade path and expose an explicit “Sincronizar herramienta LTI” admin action on the Proctoring settings page. Make both paths idempotent and safe when `mod_lti` is not installed: settings remain usable and the status reports `registered=false`.

- [ ] **Step 4: Scope the panel**

Read `courseid` with `PARAM_INT`, set the course context when supplied, and keep all repository queries capability-scoped. Preserve the existing no-course panel behavior for system reviewers.

- [ ] **Step 5: Run UI and native tests**

Run: `pnpm --dir moodle-native test -- --run`

Run: `php admin/tool/behat/cli/util.php --profile=proctoring --suite=moodle-native/tests/behat/proctoring_native.feature`

Expected: PASS; Moodle’s standard external-tools page shows exactly one Proctoring row and the panel opens without HTTP 500.

- [ ] **Step 6: Commit**

```text
git add moodle-native/plugins/local/proctoring/lib.php moodle-native/plugins/local/proctoring/index.php moodle-native/plugins/local/proctoring/classes/output/panel_page.php moodle-native/plugins/local/proctoring/templates/panel_page.mustache moodle-native/plugins/local/proctoring/styles.css moodle-native/tests/behat/proctoring_native.feature
git commit -m "feat: expose proctoring in Moodle external tools"
```

### Task 4: Validate production appearance and rollback

**Files:**
- Modify: `moodle-native/docs/installation.md`
- Modify: `moodle-native/docs/configuration.md`
- Modify: `moodle-native/docs/feature-matrix.md`
- Modify: `deploy/README.md`

**Interfaces:**
- Operator checklist verifies the exact navigation path and the standard Moodle LTI row.
- Rollback removes only the Proctoring registration or disables it through `lti_tool_service::disable()`; native data remains intact.

- [ ] **Step 1: Add production checks**

Document these checks: open a course, select **Más → Herramientas externas LTI**, verify one row named **Proctoring**, verify its activity chooser checkbox, launch as teacher, launch as student with a valid attempt, and verify unauthorized users receive Moodle permission errors.

- [ ] **Step 2: Run the checks on a Moodle copy first**

Run the native PHPUnit suite, the Behat LTI scenarios, `php admin/cli/cron.php`, and a browser check of `/local/proctoring/index.php` and the LTI row. Expected: no HTTP 500, no duplicate rows, and no external network dependency.

- [ ] **Step 3: Commit documentation**

```text
git add moodle-native/docs/installation.md moodle-native/docs/configuration.md moodle-native/docs/feature-matrix.md deploy/README.md
git commit -m "docs: document native proctoring LTI operation"
```
