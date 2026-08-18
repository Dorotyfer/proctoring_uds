import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/app.js';

test('accepts the UTC Z timestamps emitted by Moodle session_manager', async (t) => {
  const app = createApp({
    environment: {
      MOODLE_INTEGRATION_KEY: 'moodle-key',
      WORKER_INTEGRATION_KEY: 'worker-key'
    },
    tokenSecret: 'a-token-secret-that-is-long-enough',
    now: () => new Date('2026-08-18T12:00:00.000Z'),
    repository: { create: async (session) => session }
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/v1/internal/sessions',
    headers: { 'x-moodle-integration-key': 'moodle-key' },
    payload: {
      moodleUserId: '5',
      moodleCourseId: '6',
      moodleQuizId: '7',
      moodleAttemptId: '4',
      deviceMode: 'seb',
      issuedAt: '2026-08-18T12:00:00.000Z',
      expiresAt: '2026-08-18T13:00:00.000Z'
    }
  });

  assert.equal(response.statusCode, 201);
});
