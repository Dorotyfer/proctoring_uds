import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../../plugins/local/proctoring/', import.meta.url);

test('panel service and authorized endpoints exist', async () => {
  const files = [
    'classes/service/panel_service.php',
    'classes/external/list_courses.php',
    'classes/external/list_course_attempts.php',
    'classes/external/get_session_detail.php',
    'classes/external/review_alert.php',
    'classes/external/reset_biometric_profile.php',
    'classes/output/panel_page.php',
    'classes/output/session_detail.php',
    'index.php',
    'session.php'
  ];

  await Promise.all(files.map(async (file) => {
    const source = await readFile(new URL(file, root), 'utf8');
    if (!['index.php', 'session.php'].includes(file)) {
      assert.match(source, /defined\('MOODLE_INTERNAL'\) \|\| die\(\);/);
    }
  }));
});

test('panel enforces course scoping and caps page size', async () => {
  const source = await readFile(new URL('classes/service/panel_service.php', root), 'utf8');
  assert.match(source, /has_capability/);
  assert.match(source, /context_course/);
  assert.match(source, /min\(100/);
  assert.match(source, /review_alert/);
});

test('panel renderable has the Mustache template expected by Moodle', async () => {
  const template = await readFile(new URL('templates/panel_page.mustache', root), 'utf8');
  assert.match(template, /data-region="panel"/);
});
