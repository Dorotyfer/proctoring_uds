import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { createEvidenceEncryptionService } from '../src/services/evidence-encryption-service.js';

test('encrypts reference captures with authenticated encryption', () => {
  const key = crypto.randomBytes(32);
  const plaintext = Buffer.from('reference-jpeg');
  const encrypted = createEvidenceEncryptionService(key).encrypt(plaintext);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, encrypted.iv);
  decipher.setAuthTag(encrypted.tag);
  const restored = Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]);

  assert.deepEqual(restored, plaintext);
  assert.notDeepEqual(encrypted.ciphertext, plaintext);
  assert.equal(encrypted.hash.length, 64);
});

test('rejects ciphertext changed after encryption', () => {
  const service = createEvidenceEncryptionService(Buffer.alloc(32, 2));
  const encrypted = service.encrypt(Buffer.from('capture'));
  encrypted.ciphertext[0] ^= 1;
  assert.throws(() => service.decrypt(encrypted));
});
