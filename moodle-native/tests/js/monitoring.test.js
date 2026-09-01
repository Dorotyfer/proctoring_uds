import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../../plugins/local/proctoring/', import.meta.url);

test('native evidence and biometric services use private encrypted storage', async () => {
  const files = [
    'classes/service/crypto_service.php',
    'classes/service/evidence_service.php',
    'classes/service/biometric_service.php',
    'classes/external/upload_evidence.php',
    'classes/external/record_biometric_check.php',
    'evidence.php'
  ];

  await Promise.all(files.map(async (file) => {
    const source = await readFile(new URL(file, root), 'utf8');
    if (file !== 'evidence.php') {
      assert.match(source, /defined\('MOODLE_INTERNAL'\) \|\| die\(\);/);
    }
  }));
});

test('crypto and evidence code enforce AES-GCM and the 200 KB JPEG limit', async () => {
  const crypto = await readFile(new URL('classes/service/crypto_service.php', root), 'utf8');
  const evidence = await readFile(new URL('classes/service/evidence_service.php', root), 'utf8');

  assert.match(crypto, /aes-256-gcm/);
  assert.match(crypto, /openssl_encrypt/);
  assert.match(crypto, /openssl_decrypt/);
  assert.match(evidence, /200 \* 1024/);
  assert.match(evidence, /create_file_from_string/);
  assert.match(evidence, /context_system::instance/);
});

test('monitoring AMD modules cover face, environment, device and biometric signals', async () => {
  const files = ['monitor.js', 'face_analysis.js', 'environment_analysis.js', 'device_signals.js', 'biometric_monitor.js'];
  await Promise.all(files.map(async (file) => {
    const source = await readFile(new URL(`amd/src/${file}`, root), 'utf8');
    assert.match(source, /define\(/);
  }));
});
