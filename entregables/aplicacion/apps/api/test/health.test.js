import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';

test('returns 503 when MariaDB is unavailable', async () => {
  const app = await buildApp({
    eventService: {},
    healthService: { async check() { throw new Error('connection failed'); } },
    jwtSecret: 'test-secret',
    moodleIntegrationKey: 'moodle-key',
    sessionService: {},
    logger: false
  });
  const response = await app.inject({ method: 'GET', url: '/health' });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { status: 'degraded', database: 'unavailable' });
  await app.close();
});
