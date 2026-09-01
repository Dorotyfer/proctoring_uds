# Proctoring Legacy Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the live `quizaccess_udsmonitor` settings into the native Proctoring policy without data loss, duplicate ownership, or unsafe logging.

**Architecture:** A read-only repository inspects legacy config/plugin tables only when they exist. A pure mapper converts legacy keys into the normalized policy contract. A migration service performs dry-run or idempotent execution and records redacted outcomes in a migration audit table. The legacy plugin remains installed until parity is verified.

**Tech Stack:** PHP 8.1+, Moodle 4.3.3+, Moodle DB/XMLDB, Moodle CLI, PHPUnit, Behat, SSH deployment scripts.

**Spec:** `docs/superpowers/specs/2026-09-01-unified-moodle-proctoring-design.md`

## Global Constraints

- Back up code and database before production migration.
- Dry-run output must expose counts and field names, never encryption keys, biometric descriptors, or raw evidence.
- Mapping is idempotent and rerunnable by migration version.
- Unknown fields are recorded as warnings, not silently discarded.
- Legacy tables/files are not deleted in the first delivery.
- Existing quiz attempts keep their original policy snapshots.
- No unrelated files or working-tree changes may be staged.

---

### Task 1: Add a pure legacy policy mapper

**Files:**
- Create: `moodle-native/plugins/local/proctoring/classes/domain/legacy_policy_mapper.php`
- Modify: `moodle-native/plugins/local/proctoring/classes/domain/policy_schema.php`
- Test: `moodle-native/plugins/local/proctoring/tests/legacy_policy_mapper_test.php`

**Interfaces:**
- `local_proctoring\domain\legacy_policy_mapper::map_global(array $source): array` returns `settings`, `warnings`, and `redacted_sources`.
- `local_proctoring\domain\legacy_policy_mapper::map_quiz(array $source): array` returns `policy`, `warnings`, and `sourcekeys`.
- `local_proctoring\domain\legacy_policy_mapper::known_quiz_keys(): array` returns every mapped `udsm_*` key.

- [ ] **Step 1: Write mapping tests**

```php
public function test_maps_legacy_quiz_controls(): void {
    $result = \local_proctoring\domain\legacy_policy_mapper::map_quiz([
        'udsm_enabled' => 1,
        'udsm_interval' => 15,
        'udsm_tabswitch' => 1,
        'udsm_maxwarnings' => 3,
        'udsm_action' => 'close',
        'udsm_identitycheck' => 1,
        'udsm_identitythresh' => 0.72,
    ]);

    $this->assertTrue($result['policy']['enabled']);
    $this->assertSame(15, $result['policy']['capture']['interval']);
    $this->assertTrue($result['policy']['signals']['page_visibility_changed']['enabled']);
    $this->assertSame(3, $result['policy']['alerts']['maxwarnings']);
    $this->assertTrue($result['policy']['identity']['enabled']);
    $this->assertSame(0.72, $result['policy']['identity']['threshold']);
}

public function test_unknown_legacy_keys_become_warnings(): void {
    $result = \local_proctoring\domain\legacy_policy_mapper::map_quiz([
        'udsm_future_option' => 'on',
    ]);

    $this->assertNotEmpty($result['warnings']);
    $this->assertSame([], $result['policy']['signals']);
}
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `php admin/tool/phpunit/cli/util.php --testcase=local_proctoring\tests\legacy_policy_mapper_test`

Expected: FAIL because the mapper is not defined.

- [ ] **Step 3: Implement explicit mappings**

Map `keepcapturedays`, `maximagekb`, and `defaultidentitythresh` to global settings. Map all quiz keys from the specification, including behavior, warnings, CONES/advanced analysis, identity, and legal evidence. Coerce booleans, positive integers, bounded floats, and enumerations through `policy_schema`; preserve unmapped key names in warnings.

- [ ] **Step 4: Run focused tests**

Run: `php admin/tool/phpunit/cli/util.php --testcase=local_proctoring\tests\legacy_policy_mapper_test`

Expected: PASS, including redaction tests proving `encryptionkey` is never returned in `redacted_sources`.

- [ ] **Step 5: Commit**

```text
git add moodle-native/plugins/local/proctoring/classes/domain/legacy_policy_mapper.php moodle-native/plugins/local/proctoring/classes/domain/policy_schema.php moodle-native/plugins/local/proctoring/tests/legacy_policy_mapper_test.php
git commit -m "feat: map legacy proctoring policies"
```

### Task 2: Implement safe legacy discovery and migration audit

**Files:**
- Create: `moodle-native/plugins/local/proctoring/classes/repository/legacy_settings_repository.php`
- Create: `moodle-native/plugins/local/proctoring/classes/repository/migration_repository.php`
- Modify: `moodle-native/plugins/local/proctoring/db/install.xml`
- Modify: `moodle-native/plugins/local/proctoring/db/upgrade.php`
- Modify: `moodle-native/plugins/local/proctoring/version.php`
- Test: `moodle-native/plugins/local/proctoring/tests/legacy_settings_repository_test.php`

**Interfaces:**
- `legacy_settings_repository::has_component(string $component): bool`.
- `legacy_settings_repository::read_global(): array`.
- `legacy_settings_repository::read_quiz_policies(): array`.
- `migration_repository::record(array $entry): int`.
- `migration_repository::find(string $migrationversion, string $sourcekey, int $quizid = 0): ?\stdClass`.

- [ ] **Step 1: Add the XMLDB audit table and schema test**

Create `local_proctoring_migration` with `id`, `migrationversion`, `sourcecomponent`, `sourcekey`, `quizid`, `targetkey`, `status`, `message`, `timecreated`, and `actorid`. Do not store raw source values; store field names, counts, hashes for non-secret comparison, and redacted messages.

```php
public function test_migration_table_is_declared(): void {
    $xml = file_get_contents(__DIR__ . '/../db/install.xml');
    $this->assertStringContainsString('TABLE NAME="local_proctoring_migration"', $xml);
    $this->assertStringContainsString('FIELD NAME="migrationversion"', $xml);
}
```

- [ ] **Step 2: Run the schema test before implementation**

Run: `php admin/tool/phpunit/cli/util.php --testcase=local_proctoring\tests\legacy_settings_repository_test`

Expected: FAIL because the migration table and repositories do not exist.

- [ ] **Step 3: Implement guarded legacy reads**

`has_component()` must inspect Moodle plugin configuration without throwing when `quizaccess_udsmonitor` is absent. `read_global()` must read the exact global keys from `config_plugins`. `read_quiz_policies()` must inspect the live legacy table name discovered from the installed component, return normalized source arrays keyed by quiz ID, and return an empty result when the table does not exist.

- [ ] **Step 4: Implement the audit repository**

Use parameterized DB calls and a unique lookup on `migrationversion`, `sourcecomponent`, `sourcekey`, and `quizid`. `record()` must be safe to call repeatedly and must never log values whose key contains `key`, `secret`, `token`, `descriptor`, or `image`.

- [ ] **Step 5: Run tests and upgrade checks**

Run: `php admin/tool/phpunit/cli/util.php --testcase=local_proctoring\tests\legacy_settings_repository_test`

Run: `php admin/tool/phpunit/cli/util.php --testcase=tool\installaddon\tests\plugin_manager_test`

Expected: PASS and local plugin upgrade `2026090102` creates the audit table without changing existing native tables.

- [ ] **Step 6: Commit**

```text
git add moodle-native/plugins/local/proctoring/classes/repository/legacy_settings_repository.php moodle-native/plugins/local/proctoring/classes/repository/migration_repository.php moodle-native/plugins/local/proctoring/db/install.xml moodle-native/plugins/local/proctoring/db/upgrade.php moodle-native/plugins/local/proctoring/version.php moodle-native/plugins/local/proctoring/tests/legacy_settings_repository_test.php
git commit -m "feat: add safe legacy migration audit"
```

### Task 3: Add dry-run and idempotent migration service

**Files:**
- Create: `moodle-native/plugins/local/proctoring/classes/service/legacy_migration_service.php`
- Create: `moodle-native/plugins/local/proctoring/cli/migrate_legacy.php`
- Modify: `moodle-native/plugins/local/proctoring/db/access.php`
- Modify: `moodle-native/plugins/local/proctoring/lang/es/local_proctoring.php`
- Modify: `moodle-native/plugins/local/proctoring/lang/en/local_proctoring.php`
- Test: `moodle-native/plugins/local/proctoring/tests/legacy_migration_service_test.php`

**Interfaces:**
- `legacy_migration_service::preview(): array`.
- `legacy_migration_service::migrate(int $actorid, bool $dryrun = true): array`.
- `legacy_migration_service::status(): array`.
- CLI flags: `--dry-run`, `--execute`, `--format=json`, and optional `--quizid=<id>`.
- The constructor accepts `legacy_settings_repository`, `migration_repository`, `legacy_policy_mapper`, and `quiz_policy_service` dependencies so service tests do not require the live legacy plugin.

- [ ] **Step 1: Write service tests**

```php
protected function setUp(): void {
    parent::setUp();
    $this->resetAfterTest();
    $this->db = $GLOBALS['DB'];
    $this->service = new \local_proctoring\service\legacy_migration_service(
        new \local_proctoring\repository\legacy_settings_repository($this->db),
        new \local_proctoring\repository\migration_repository($this->db),
        new \local_proctoring\domain\legacy_policy_mapper(),
        new \local_proctoring\service\quiz_policy_service($this->db)
    );
}

public function test_preview_does_not_write_native_policy(): void {
    $result = $this->service->migrate(2, true);

    $this->assertTrue($result['dryrun']);
    $this->assertGreaterThanOrEqual(0, $result['quizzes_seen']);
    $this->assertSame(0, $this->db->count_records('quizaccess_proctoring'));
}

public function test_execute_is_idempotent(): void {
    $first = $this->service->migrate(2, false);
    $second = $this->service->migrate(2, false);

    $this->assertSame($first['migrated'], $second['migrated']);
    $this->assertSame($first['warnings'], $second['warnings']);
    $this->assertSame(1, $this->db->count_records('quizaccess_proctoring', ['quizid' => 41]));
}
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `php admin/tool/phpunit/cli/util.php --testcase=local_proctoring\tests\legacy_migration_service_test`

Expected: FAIL because the service and CLI do not exist.

- [ ] **Step 3: Implement preview and execution**

`preview()` must report source availability, global keys, quiz count, mapped count, warning count, and whether the native plugin is installed. `migrate()` must map globals, upsert native global defaults, map quiz policies through `quiz_policy_service`, write the audit rows, and return stable counts. In dry-run mode it must not write settings, policy rows, or audit rows.

- [ ] **Step 4: Implement the CLI entry point**

Require administrator capability, reject simultaneous `--dry-run` and `--execute`, default to dry-run when neither is supplied, and print JSON when `--format=json` is selected. Exit nonzero when the source component is present but schema inspection fails.

- [ ] **Step 5: Add migration capability and translations**

Add `local/proctoring:migratelegacy` at system context for managers. Add Spanish/English strings for preview, execution, warnings, source unavailable, and completion counts. Do not expose source values in the UI.

- [ ] **Step 6: Run tests**

Run: `php admin/tool/phpunit/cli/util.php --testcase=local_proctoring\tests\legacy_migration_service_test`

Run: `php local/proctoring/cli/migrate_legacy.php --dry-run --format=json`

Expected: PASS; CLI prints counts and no secrets.

- [ ] **Step 7: Commit**

```text
git add moodle-native/plugins/local/proctoring/classes/service/legacy_migration_service.php moodle-native/plugins/local/proctoring/cli/migrate_legacy.php moodle-native/plugins/local/proctoring/db/access.php moodle-native/plugins/local/proctoring/lang moodle-native/plugins/local/proctoring/tests/legacy_migration_service_test.php
git commit -m "feat: migrate legacy proctoring configuration safely"
```

### Task 4: Verify parity and suppress the legacy UI safely

**Files:**
- Create: `moodle-native/plugins/local/proctoring/classes/service/legacy_compatibility_service.php`
- Modify: `moodle-native/plugins/local/proctoring/index.php`
- Modify: `moodle-native/tests/behat/proctoring_native.feature`
- Modify: `moodle-native/docs/configuration.md`

**Interfaces:**
- `legacy_compatibility_service::compare(int $quizid): array`.
- `legacy_compatibility_service::can_hide_legacy_ui(): bool`.
- `legacy_compatibility_service::legacy_status(): array`.

- [ ] **Step 1: Add parity tests**

```php
public function test_legacy_ui_is_not_hidden_before_parity(): void {
    $this->assertFalse($this->service->can_hide_legacy_ui());
}

public function test_parity_requires_zero_unmapped_fields(): void {
    $result = $this->service->compare(41);
    $this->assertArrayHasKey('unmapped', $result);
    $this->assertArrayHasKey('equal', $result);
}
```

- [ ] **Step 2: Run the tests before migration**

Run: `php admin/tool/phpunit/cli/util.php --testcase=local_proctoring\tests\legacy_compatibility_service_test`

Expected: PASS with `can_hide_legacy_ui()` false on an unverified installation.

- [ ] **Step 3: Implement comparison and status reporting**

Compare effective legacy and native values field by field, report `equal`, `different`, `unmapped`, and `missing`, and require a completed migration version plus zero unmapped fields before returning true. The service must never disable a plugin by itself.

- [ ] **Step 4: Verify the actual Moodle legacy enablement mechanism on the server**

Inspect Moodle core’s quiz access rule discovery and the installed `quizaccess_udsmonitor` component. Use the supported Moodle/plugin mechanism to hide the legacy form only after `can_hide_legacy_ui()` is true. If the installed legacy rule has no supported disable flag, leave it installed and apply the suppression in the legacy rule’s form hook through a minimal compatibility patch, preserving its runtime data path until cutover.

- [ ] **Step 5: Add Behat migration safeguards**

Add scenarios for dry-run visibility, rerunning execution without duplicates, and the absence of “UDS Monitor Académico” only after parity. Keep the legacy scenario available for rollback.

- [ ] **Step 6: Run the full native test suite and commit**

Run: `pnpm --dir moodle-native test -- --run`

Run: `php admin/tool/behat/cli/util.php --profile=proctoring --suite=moodle-native/tests/behat/proctoring_native.feature`

```text
git add moodle-native/plugins/local/proctoring/classes/service/legacy_compatibility_service.php moodle-native/plugins/local/proctoring/index.php moodle-native/tests/behat/proctoring_native.feature moodle-native/docs/configuration.md
git commit -m "test: verify legacy proctoring parity"
```

### Task 5: Deploy migration in a reversible sequence

**Files:**
- Modify: `deploy/README.md`
- Modify: `moodle-native/docs/installation.md`
- Create: `deploy/migrate-native-proctoring.ps1`

**Interfaces:**
- Deployment accepts a configured Moodle root and backup destination, never hardcoded credentials.
- Deployment runs backup, plugin copy, Moodle upgrade, dry-run, explicit execute, cache purge, and post-check in that order.

- [ ] **Step 1: Add deployment script validation tests**

```powershell
$script = Get-Content -Raw "$PSScriptRoot/migrate-native-proctoring.ps1"
if ($script -notmatch 'backup') { throw 'backup step missing' }
if ($script -notmatch 'migrate_legacy.php') { throw 'migration step missing' }
if ($script -notmatch 'purge_caches.php') { throw 'cache purge step missing' }
```

- [ ] **Step 2: Implement safe deployment order**

Use explicit paths, abort when the Moodle root is missing, create a timestamped backup, copy only native plugin directories, run upgrade, run migration dry-run, require an explicit execute switch, purge caches, and run the post-check URLs/CLI commands. Do not delete the old plugin.

- [ ] **Step 3: Document rollback**

Document restoring the timestamped plugin backup, reactivating legacy UI/runtime through the supported Moodle mechanism, and purging caches. State that database rollback requires the database backup and maintenance window.

- [ ] **Step 4: Run a dry deployment check and commit**

Run: `pwsh -File deploy/migrate-native-proctoring.ps1 -MoodleRoot C:\moodle -DryRun`

Expected: Prints planned actions without copying, writing database settings, or deleting files.

```text
git add deploy/README.md deploy/migrate-native-proctoring.ps1 moodle-native/docs/installation.md
git commit -m "ops: document reversible proctoring migration"
```
