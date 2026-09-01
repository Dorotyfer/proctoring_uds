import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../../plugins/local/proctoring/', import.meta.url);

test('native schema contains the persistence tables', async () => {
  const xml = await readFile(new URL('db/install.xml', root), 'utf8');

  for (const table of [
    'local_proctoring_policy',
    'local_proctoring_session',
    'local_proctoring_event',
    'local_proctoring_alert',
    'local_proctoring_evidence',
    'local_proctoring_evaudit',
    'local_proctoring_biometric',
    'local_proctoring_biover',
    'local_proctoring_biocheck',
    'local_proctoring_envsignal',
    'local_proctoring_riskscore'
  ]) {
    assert.match(xml, new RegExp(`NAME="${table}"`));
  }
});

test('native upgrade installs the schema for an already registered legacy plugin', async () => {
  const version = await readFile(new URL('version.php', root), 'utf8');
  const upgrade = await readFile(new URL('db/upgrade.php', root), 'utf8');
  const xml = await readFile(new URL('db/install.xml', root), 'utf8');

  assert.match(version, /\$plugin->version\s*=\s*2026090105/);
  assert.match(upgrade, /install_one_table_from_xmldb_file/);
  assert.match(upgrade, /upgrade_plugin_savepoint/);
  assert.match(xml, /NAME="local_proctoring_migration"/);
});

test('legacy repository detects Moodle quiz access rule names on Moodle 4.5', async () => {
  const repository = await readFile(new URL('classes/repository/legacy_settings_repository.php', root), 'utf8');

  assert.match(repository, /core_component::get_plugin_list\('quizaccess'\)/);
  assert.match(repository, /preg_replace\('\/\^quizaccess_\//);
  assert.match(repository, /array_key_exists\(\$shortname/);
  assert.match(repository, /quizaccess_udsmonitor_cfg/);
});

test('legacy mapper accepts the stored cfg field names', async () => {
  const mapper = await readFile(new URL('classes/domain/legacy_policy_mapper.php', root), 'utf8');

  assert.match(mapper, /capinterval/);
  assert.match(mapper, /warningaction/);
  assert.match(mapper, /thresh_identity_autoclose_seconds/);
  assert.match(mapper, /event_weights_json/);
});

test('policy validator accepts associative signal maps', async () => {
  const validator = await readFile(new URL('classes/domain/policy_validator.php', root), 'utf8');

  assert.match(validator, /!isset\(\$signal\['type'\]\)/);
});

test('native quiz access rule upgrades the policy columns', async () => {
  const version = await readFile(new URL('../../quizaccess/proctoring/version.php', root), 'utf8');
  const upgrade = await readFile(new URL('../../quizaccess/proctoring/db/upgrade.php', root), 'utf8');

  assert.match(version, /\$plugin->version\s*=\s*2026090102/);
  assert.match(upgrade, /policyjson/);
  assert.match(upgrade, /field_exists/);
});

test('native domain and repository interfaces exist', async () => {
  const files = [
    'classes/domain/session_state.php',
    'classes/domain/policy_validator.php',
    'classes/domain/alert_policy.php',
    'classes/domain/risk_score.php',
    'classes/repository/session_repository.php',
    'classes/repository/event_repository.php',
    'classes/repository/alert_repository.php',
    'classes/repository/evidence_repository.php',
    'classes/repository/biometric_repository.php',
    'classes/repository/risk_repository.php'
  ];

  await Promise.all(files.map(async (file) => {
    const source = await readFile(new URL(file, root), 'utf8');
    assert.match(source, /defined\('MOODLE_INTERNAL'\) \|\| die\(\);/);
  }));
});
