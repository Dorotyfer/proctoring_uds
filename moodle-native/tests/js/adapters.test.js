import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../../plugins/local/proctoring/', import.meta.url);

test('optional monitoring adapters exist without external API dependencies', async () => {
  const files = [
    'amd/src/audio_monitor.js',
    'amd/src/second_camera.js',
    'classes/service/ocr_service.php',
    'classes/service/live_review_service.php',
    'adapter/README.md',
    'adapter/seb.php',
    'adapter/extension.php'
  ];
  await Promise.all(files.map(async (file) => {
    const source = await readFile(new URL(file, root), 'utf8');
    assert.doesNotMatch(source, /fetch\(|axios|API_PUBLIC_URL|integration.key/i);
  }));
});

test('audio and second-camera modules expose explicit unavailable states', async () => {
  const audio = await readFile(new URL('amd/src/audio_monitor.js', root), 'utf8');
  const camera = await readFile(new URL('amd/src/second_camera.js', root), 'utf8');
  assert.match(audio, /audio_unavailable/);
  assert.match(camera, /pairing/);
  assert.match(camera, /expires/);
});
