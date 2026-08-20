import assert from 'node:assert/strict';
import test from 'node:test';

import { createResilientObjectStorage } from '../src/services/resilient-object-storage.js';

test('retries a temporary object storage failure and returns the successful result', async () => {
  let attempts = 0;
  const storage = createResilientObjectStorage({
    async get() {
      attempts += 1;
      if (attempts < 3) throw new Error('storage_unavailable');
      return Buffer.from('encrypted');
    }
  }, { delay: async () => {}, maxAttempts: 3 });

  assert.deepEqual(await storage.get('item.enc'), Buffer.from('encrypted'));
  assert.equal(attempts, 3);
});

test('stops retrying object storage after the configured attempt limit', async () => {
  let attempts = 0;
  const storage = createResilientObjectStorage({
    async put() {
      attempts += 1;
      throw new Error('storage_unavailable');
    }
  }, { delay: async () => {}, maxAttempts: 2 });

  await assert.rejects(() => storage.put('item.enc', Buffer.from('data'), 'application/octet-stream'), /storage_unavailable/);
  assert.equal(attempts, 2);
});

test('does not retry permanent object storage authorization errors', async () => {
  let attempts = 0;
  const error = new Error('AccessDenied');
  error.$metadata = { httpStatusCode: 403 };
  const storage = createResilientObjectStorage({
    async get() {
      attempts += 1;
      throw error;
    }
  }, { delay: async () => {}, maxAttempts: 3 });

  await assert.rejects(() => storage.get('item.enc'), /AccessDenied/);
  assert.equal(attempts, 1);
});
