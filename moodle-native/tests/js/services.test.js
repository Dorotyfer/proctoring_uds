import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../../plugins/local/proctoring/', import.meta.url);

test('native service and external endpoint classes exist', async () => {
  const files = [
    'classes/service/session_service.php',
    'classes/service/event_service.php',
    'classes/service/incident_service.php',
    'classes/external/start_attempt_session.php',
    'classes/external/get_attempt_session.php',
    'classes/external/activate_attempt_session.php',
    'classes/external/complete_attempt_session.php',
    'classes/external/record_session_events.php',
    'classes/external/record_incident.php',
    'db/services.php'
  ];

  await Promise.all(files.map(async (file) => {
    const source = await readFile(new URL(file, root), 'utf8');
    assert.match(source, /defined\('MOODLE_INTERNAL'\) \|\| die\(\);/);
  }));
});

test('Moodle service declarations use AJAX and no external URL settings', async () => {
  const services = await readFile(new URL('db/services.php', root), 'utf8');
  assert.match(services, /'ajax'\s*=>\s*true/);
  assert.doesNotMatch(services, /integration.key|api.url|panel.url/i);
});
