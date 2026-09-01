import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../../plugins/local/proctoring/', import.meta.url);

test('preparation flow contains consent, camera, liveness and activation states', async () => {
  const source = await readFile(new URL('amd/src/preparation.js', root), 'utf8');

  for (const state of ['consent', 'camera', 'liveness', 'identity_document', 'activate']) {
    assert.match(source, new RegExp(state));
  }
});

test('session transport uses Moodle AJAX functions', async () => {
  const source = await readFile(new URL('amd/src/session_api.js', root), 'utf8');

  assert.match(source, /core\/ajax/);
  assert.match(source, /local_proctoring_get_attempt/);
  assert.match(source, /local_proctoring_activate_attempt/);
  assert.doesNotMatch(source, /fetch\(|axios|API_PUBLIC_URL|integration.key/i);
});
