# Proctoring Unified Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `local_proctoring` the only visible owner of global and per-quiz Proctoring configuration.

**Architecture:** Define one normalized policy contract in the local plugin. The admin page stores institution defaults under `local_proctoring/*`; the quiz access rule renders one Moodle form section and stores versioned per-quiz snapshots. Session creation consumes the effective policy through a service instead of reading form fields directly.

**Tech Stack:** PHP 8.1+, Moodle 4.3.3+, Moodle Forms, Moodle DB/XMLDB, PHPUnit, JavaScript AMD, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-01-unified-moodle-proctoring-design.md`

## Global Constraints

- Moodle is the only production runtime; no Node.js API, external database, S3, or integration server.
- PHP compatibility remains 8.1+ and Moodle compatibility remains 4.3.3+.
- Evidence and biometric descriptors remain encrypted before Moodle File API storage.
- Secret keys never enter JavaScript, templates, logs, or repository files.
- The effective quiz policy is snapshotted per attempt and does not change retroactively.
- Existing unrelated working-tree changes must not be staged or overwritten.
- Do not remove the legacy plugin or its data in this plan.

---

### Task 1: Introduce the normalized policy contract

**Files:**
- Create: `moodle-native/plugins/local/proctoring/classes/domain/policy_schema.php`
- Modify: `moodle-native/plugins/local/proctoring/classes/domain/policy_validator.php`
- Test: `moodle-native/plugins/local/proctoring/tests/policy_schema_test.php`
- Test: `moodle-native/plugins/local/proctoring/tests/domain_test.php`

**Interfaces:**
- Produces `local_proctoring\domain\policy_schema::defaults(): array`.
- Produces `local_proctoring\domain\policy_schema::normalize(array $policy): array` returning `valid`, `errors`, and `policy`.
- Produces `local_proctoring\domain\policy_schema::legacy_signal_keys(): array`.
- `policy_validator::validate(array $policy): array` continues returning `valid`, `errors`, and normalized `policy`.

- [ ] **Step 1: Write the failing tests**

```php
public function test_defaults_contain_all_unified_sections(): void {
    $policy = \local_proctoring\domain\policy_schema::defaults();

    $this->assertSame(false, $policy['enabled']);
    $this->assertSame('either', $policy['devicepolicy']);
    $this->assertSame('medium', $policy['controllevel']);
    $this->assertArrayHasKey('capture', $policy);
    $this->assertArrayHasKey('signals', $policy);
    $this->assertArrayHasKey('alerts', $policy);
    $this->assertArrayHasKey('identity', $policy);
    $this->assertArrayHasKey('risk', $policy);
    $this->assertArrayHasKey('privacy', $policy);
}

public function test_normalize_rejects_unknown_device_mode(): void {
    $result = \local_proctoring\domain\policy_schema::normalize([
        'devicepolicy' => 'desktop',
    ]);

    $this->assertContains('devicepolicy', $result['errors']);
    $this->assertFalse($result['valid']);
}
```

- [ ] **Step 2: Run the focused Moodle test**

Run: `php admin/tool/phpunit/cli/util.php --testcase=local_proctoring\tests\policy_schema_test`

Expected: FAIL because `policy_schema` and its defaults do not exist.

- [ ] **Step 3: Implement the minimal schema**

Create `policy_schema` with explicit defaults for `enabled`, `devicepolicy`, `controllevel`, `failurepolicy`, `capture`, `signals`, `alerts`, `identity`, `risk`, `privacy`, and `version`. `normalize()` must merge missing nested keys, preserve only arrays for nested sections, and delegate allowed signal validation to `policy_validator` without silently dropping unknown input.

- [ ] **Step 4: Run focused tests and the existing domain tests**

Run: `php admin/tool/phpunit/cli/util.php --testcase=local_proctoring\tests\policy_schema_test --testcase=local_proctoring\tests\domain_test`

Expected: PASS, with invalid policy errors naming the rejected field.

- [ ] **Step 5: Commit**

```text
git add moodle-native/plugins/local/proctoring/classes/domain/policy_schema.php moodle-native/plugins/local/proctoring/classes/domain/policy_validator.php moodle-native/plugins/local/proctoring/tests/policy_schema_test.php moodle-native/plugins/local/proctoring/tests/domain_test.php
git commit -m "feat: define unified proctoring policy contract"
```

### Task 2: Build the single global Proctoring settings page

**Files:**
- Modify: `moodle-native/plugins/local/proctoring/settings.php`
- Modify: `moodle-native/plugins/local/proctoring/lang/es/local_proctoring.php`
- Modify: `moodle-native/plugins/local/proctoring/lang/en/local_proctoring.php`
- Modify: `moodle-native/plugins/local/proctoring/version.php`
- Test: `moodle-native/plugins/local/proctoring/tests/settings_contract_test.php`

**Interfaces:**
- Stores defaults through Moodle `admin_setting_*` keys under `local_proctoring/*`.
- Uses the exact groups `generalheading`, `signalsheading`, `alertsheading`, `identityheading`, `riskheading`, `privacyheading`, and `ltiheading`.
- Uses the exact settings `captureinterval`, `capturewidth`, `maximagekb`, `retentiondays`, `detecttabswitch`, `detectfullscreen`, `detectclipboard`, `detectf12`, `detectresize`, `detectphone`, `detectvoice`, `detectgaze`, `environmentanalysis`, `emotionanalysis`, `predictiveanalysis`, `maxwarnings`, `warningaction`, `notifyreviewers`, `biometricenabled`, `biometricthreshold`, `identityautoclose`, `identityautoclosestreak`, `identityautocloseseconds`, `consentversion`, `riskweights`, `institutionrules`, `legalevidence`, `lti_enabled`, `lti_name`, `lti_description`, and `lti_activitychooser`.

- [ ] **Step 1: Add the settings contract test**

```php
public function test_unified_settings_use_local_proctoring_component(): void {
    $settings = file_get_contents(__DIR__ . '/../settings.php');

    $this->assertStringContainsString("new admin_setting_heading('local_proctoring/generalheading'", $settings);
    $this->assertStringContainsString("'local_proctoring/captureinterval'", $settings);
    $this->assertStringContainsString("'local_proctoring/lti_enabled'", $settings);
    $this->assertStringNotContainsString('udsmonitor', strtolower($settings));
}
```

- [ ] **Step 2: Run the focused test**

Run: `php admin/tool/phpunit/cli/util.php --testcase=local_proctoring\tests\settings_contract_test`

Expected: FAIL because the grouped settings and LTI keys are not present.

- [ ] **Step 3: Implement grouped settings**

Replace the flat settings list with Moodle `admin_setting_heading` groups and typed settings. Use `PARAM_INT` for counts/seconds, `PARAM_FLOAT` for thresholds, `PARAM_BOOL` for switches, `PARAM_ALPHANUMEXT` for consent versions, and `PARAM_TEXT` for the institution description. Keep `encryptionkey` as `admin_setting_configpasswordunmask` and do not add it to any client-facing export.

- [ ] **Step 4: Add translations and bump the local plugin version**

Add Spanish and English labels/descriptions for every setting and group. Bump `local_proctoring` to `2026090102`; the upgrade must not overwrite saved values.

- [ ] **Step 5: Run tests and diff checks**

Run: `php admin/tool/phpunit/cli/util.php --testcase=local_proctoring\tests\settings_contract_test`

Run: `git diff --check -- moodle-native/plugins/local/proctoring`

Expected: PASS and no whitespace errors.

- [ ] **Step 6: Commit**

```text
git add moodle-native/plugins/local/proctoring/settings.php moodle-native/plugins/local/proctoring/lang moodle-native/plugins/local/proctoring/version.php moodle-native/plugins/local/proctoring/tests/settings_contract_test.php
git commit -m "feat: group proctoring site settings"
```

### Task 3: Render and save one Proctoring quiz section

**Files:**
- Create: `moodle-native/plugins/local/proctoring/classes/service/quiz_policy_service.php`
- Modify: `moodle-native/plugins/quizaccess/proctoring/rule.php`
- Modify: `moodle-native/plugins/quizaccess/proctoring/lang/es/quizaccess_proctoring.php`
- Modify: `moodle-native/plugins/quizaccess/proctoring/lang/en/quizaccess_proctoring.php`
- Modify: `moodle-native/plugins/quizaccess/proctoring/version.php`
- Test: `moodle-native/plugins/local/proctoring/tests/quiz_policy_service_test.php`
- Test: `moodle-native/plugins/quizaccess/proctoring/tests/rule_test.php`

**Interfaces:**
- `local_proctoring\service\quiz_policy_service::defaults(): array`.
- `local_proctoring\service\quiz_policy_service::from_quiz_form(\stdClass $quiz): array`.
- `local_proctoring\service\quiz_policy_service::save(\stdClass $quiz, int $actorid): array`.
- `local_proctoring\service\quiz_policy_service::for_quiz(int $quizid): array`.
- `quizaccess_proctoring::add_settings_form_fields()` adds exactly one Moodle form header `proctoringheader` titled by `pluginname` and all subgroups under it.

- [ ] **Step 1: Write the failing service test**

```php
public function test_form_policy_merges_defaults_and_explicit_values(): void {
    $service = new \local_proctoring\service\quiz_policy_service();
    $quiz = (object)[
        'id' => 41,
        'course' => 7,
        'proctoringenabled' => 1,
        'proctoringallowedmode' => 'browser',
        'proctoringfailurepolicy' => 'allow_with_alert',
        'proctoringcontrollevel' => 'high',
        'proctoringsignals' => json_encode(['page_visibility_changed']),
    ];

    $policy = $service->from_quiz_form($quiz);

    $this->assertTrue($policy['enabled']);
    $this->assertSame('browser', $policy['devicepolicy']);
    $this->assertSame('allow_with_alert', $policy['failurepolicy']);
    $this->assertSame('high', $policy['controllevel']);
}
```

- [ ] **Step 2: Run the focused test**

Run: `php admin/tool/phpunit/cli/util.php --testcase=local_proctoring\tests\quiz_policy_service_test`

Expected: FAIL because `quiz_policy_service` is missing.

- [ ] **Step 3: Implement policy service and form fields**

Move policy assembly out of `quizaccess_proctoring::save_settings()`. `add_settings_form_fields()` must render one `admin_setting_heading`-equivalent Moodle form header labeled **Proctoring**, followed by grouped fields for activation/device, detection, alerts, identity, risk, evidence, and consent. Avoid the legacy labels “UDS Monitor Académico”, “Detección de comportamiento”, and separate legacy headers.

- [ ] **Step 4: Save versioned policy snapshots**

Make `quiz_policy_service::save()` validate the normalized policy, upsert `quizaccess_proctoring`, and upsert `local_proctoring_policy` with `actorid`, `timecreated`, `version`, and `policyjson`. `for_quiz()` must return defaults when no override exists and must not return secrets.

- [ ] **Step 5: Make the rule consume the service**

Update `make()`, `save_settings()`, and the session policy lookup so the rule reads only `quiz_policy_service::for_quiz()`. Preserve existing access states and `quizaccess_proctoring` table compatibility.

- [ ] **Step 6: Run focused tests and JavaScript tests**

Run: `pnpm --dir moodle-native test -- --run`

Run: `php admin/tool/phpunit/cli/util.php --testcase=local_proctoring\tests\quiz_policy_service_test --testcase=quizaccess_proctoring\rule_test`

Expected: PASS; all existing native tests remain green.

- [ ] **Step 7: Commit**

```text
git add moodle-native/plugins/local/proctoring/classes/service/quiz_policy_service.php moodle-native/plugins/local/proctoring/tests/quiz_policy_service_test.php moodle-native/plugins/quizaccess/proctoring/rule.php moodle-native/plugins/quizaccess/proctoring/lang moodle-native/plugins/quizaccess/proctoring/version.php moodle-native/plugins/quizaccess/proctoring/tests/rule_test.php
git commit -m "feat: unify quiz proctoring configuration"
```

### Task 4: Verify the single visible configuration in Moodle

**Files:**
- Modify: `moodle-native/tests/behat/proctoring_native.feature`
- Modify: `moodle-native/tests/behat/steps/proctoring_steps.php`
- Modify: `moodle-native/docs/configuration.md`

**Interfaces:**
- Behat scenario verifies the admin page has `Proctoring` and no `UDS Monitor Académico`.
- Behat scenario verifies a quiz edit form has one `Proctoring` section.

- [ ] **Step 1: Add the failing Behat scenarios**

```gherkin
Scenario: Site settings are grouped under Proctoring
  Given I log in as "admin"
  And I navigate to "Plugins > Plugins locales > Proctoring"
  Then I should see "General y captura"
  And I should see "Integración LTI"
  And I should not see "UDS Monitor Académico"

Scenario: Quiz settings show one Proctoring section
  Given I am on the editing quiz page for "Examen de prueba"
  Then I should see "Proctoring"
  And I should not see "UDS Monitor Académico"
```

- [ ] **Step 2: Run the scenarios before implementation**

Run: `php admin/tool/behat/cli/util.php --profile=proctoring --suite=moodle-native/tests/behat/proctoring_native.feature`

Expected: FAIL because the grouped labels and legacy suppression are not present.

- [ ] **Step 3: Add only the Moodle navigation steps required by the scenarios**

Implement step definitions in `proctoring_steps.php` using Moodle page navigation and DOM assertions; do not add a second custom UI route.

- [ ] **Step 4: Run the scenarios after Tasks 1–3**

Run the same Behat command.

Expected: PASS with no duplicate legacy section and no HTTP 500.

- [ ] **Step 5: Update operator documentation and commit**

Document the final menu path, the global groups, quiz overrides, secret handling, and the fact that legacy migration is handled by the separate migration plan.

```text
git add moodle-native/tests/behat/proctoring_native.feature moodle-native/tests/behat/steps/proctoring_steps.php moodle-native/docs/configuration.md
git commit -m "test: verify unified proctoring navigation"
```
