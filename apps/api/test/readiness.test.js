import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/app.js';

const integrationKey = 'moodle-integration-key';
const tokenSecret = 'test-token-secret-that-is-long-enough';
const now = new Date('2026-08-18T12:00:00.000Z');

function repository() {
  const items = new Map();
  return {
    async create(session) {
      items.set(session.id, session);
      return session;
    },
    async findById(id) {
      return items.get(id) ?? null;
    },
    async setStatus(id, status) {
      items.set(id, { ...items.get(id), status });
    }
  };
}

test('requires browser-token verified readiness before Moodle allows the attempt', async (t) => {
  const app = createApp({ integrationKey, tokenSecret, repository: repository(), now: () => now });
  t.after(() => app.close());
  const created = await app.inject({
    method: 'POST',
    url: '/v1/internal/sessions',
    headers: { 'x-moodle-integration-key': integrationKey },
    payload: {
      moodleUserId: '5', moodleCourseId: '6', moodleQuizId: '7', moodleAttemptId: '4',
      deviceMode: 'browser', issuedAt: '2026-08-18T12:00:00.000Z', expiresAt: '2026-08-18T13:00:00.000Z'
    }
  }).then((response) => response.json());

  let response = await app.inject({
    method: 'GET',
    url: `/v1/internal/sessions/${created.session.id}/readiness`,
    headers: { 'x-moodle-integration-key': integrationKey }
  });
  assert.deepEqual(response.json(), { ready: false });

  response = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${created.session.id}/ready`,
    headers: { authorization: `Bearer ${created.browserToken}` }
  });
  assert.equal(response.statusCode, 200);

  response = await app.inject({
    method: 'GET',
    url: `/v1/internal/sessions/${created.session.id}/readiness`,
    headers: { 'x-moodle-integration-key': integrationKey }
  });
  assert.deepEqual(response.json(), { ready: true });
});
