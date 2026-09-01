import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../../plugins/local/proctoring/', import.meta.url);

test('privacy provider and scheduled maintenance tasks exist', async () => {
  const files = [
    'classes/privacy/provider.php',
    'classes/task/purge_expired_evidence.php',
    'classes/task/retry_pending_evidence.php',
    'classes/task/recalculate_risk.php',
    'classes/event/evidence_accessed.php',
    'classes/event/alert_reviewed.php',
    'db/tasks.php'
  ];
  await Promise.all(files.map(async (file) => {
    const source = await readFile(new URL(file, root), 'utf8');
    assert.match(source, /defined\('MOODLE_INTERNAL'\) \|\| die\(\);/);
  }));
});

test('privacy and retention code covers database rows and private files', async () => {
  const provider = await readFile(new URL('classes/privacy/provider.php', root), 'utf8');
  const purge = await readFile(new URL('classes/task/purge_expired_evidence.php', root), 'utf8');

  assert.match(provider, /get_contexts_for_userid/);
  assert.match(provider, /export_user_data/);
  assert.match(provider, /delete_data_for_user/);
  assert.match(purge, /get_file_storage/);
  assert.match(purge, /retention_delete/);
});
