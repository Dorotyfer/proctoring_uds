import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../../plugins/quizaccess/proctoring/', import.meta.url);

test('quiz lifecycle is wired to native Moodle observers', async () => {
  const events = await readFile(new URL('db/events.php', root), 'utf8');
  const observer = await readFile(new URL('classes/observer.php', root), 'utf8');

  assert.match(events, /attempt_started/);
  assert.match(events, /attempt_submitted/);
  assert.match(observer, /session_repository/);
  assert.match(observer, /transition/);
});

test('quiz rule exposes native access enforcement and page setup', async () => {
  const rule = await readFile(new URL('rule.php', root), 'utf8');
  const launch = await readFile(new URL('launch.php', root), 'utf8');

  assert.match(rule, /function prevent_access/);
  assert.match(rule, /function setup_attempt_page/);
  assert.match(rule, /quizaccess_proctoring\/launch/);
  assert.doesNotMatch(launch, /redirect\(|API|remote/i);
});
