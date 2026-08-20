import assert from 'node:assert/strict';
import test from 'node:test';

import { createEvidenceEncryptionService } from '../src/services/evidence-encryption-service.js';
import { createEvidenceService } from '../src/services/evidence-service.js';

test('stores only encrypted evidence in object storage and decrypts authorized reads', async () => {
  let storedBody;
  const records = [];
  const encryptionService = createEvidenceEncryptionService(Buffer.alloc(32, 7));
  const service = createEvidenceService({
    encryptionService,
    objectStorage: {
      async put(key, body) {
        storedBody = body;
        assert.match(key, /^session-1\/identity\/.+\.enc$/);
      },
      async get() {
        return storedBody;
      },
      async delete() {}
    },
    repository: {
      async create(input) {
        records.push(input);
        return { id: 'evidence-1', ...input };
      },
      async findExpired() {
        return [];
      }
    },
    retentionDays: 30
  });
  const source = Buffer.from('jpeg-binary');
  const evidence = await service.storeIdentity('session-1', source);
  const restored = await service.readAuthorized(evidence);

  assert.notDeepEqual(storedBody, source);
  assert.deepEqual(restored, source);
  assert.equal(records[0].kind, 'identity');
  assert.equal(records[0].contentType, 'image/jpeg');
});

test('purges expired objects and creates a retention audit record', async () => {
  const actions = [];
  const evidence = {
    id: 'evidence-1',
    objectKey: 'session/identity/item.enc'
  };
  const service = createEvidenceService({
    encryptionService: {},
    objectStorage: { async delete(key) { actions.push(['delete', key]); } },
    repository: {
      async findExpired() { return [evidence]; },
      async audit(input) { actions.push(['audit', input.action]); },
      async markDeleted(id) { actions.push(['mark', id]); }
    },
    retentionDays: 30
  });

  assert.equal(await service.purgeExpired(), 1);
  assert.deepEqual(actions, [
    ['delete', evidence.objectKey],
    ['audit', 'retention_delete'],
    ['mark', evidence.id]
  ]);
});
