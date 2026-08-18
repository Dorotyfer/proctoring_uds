import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/app.js';

const integrationKey = 'moodle-integration-key';
const tokenSecret = 'test-token-secret-that-is-long-enough';
const preparationWorkerKey = 'private-worker-key';
const now = new Date('2026-08-18T12:00:00.000Z');

function repository() {
  const items = new Map();
  const preparations = new Map();
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
    },
    async consumeLivenessChallenge({ sessionId, challengeId, completedAt }) {
      const session = items.get(sessionId);
      if (!session || session.livenessChallengeId !== challengeId || session.livenessChallengeCompletedAt) {
        return false;
      }
      items.set(sessionId, { ...session, livenessChallengeCompletedAt: completedAt });
      return true;
    },
    async savePreparation(submission) {
      preparations.set(submission.sessionId, submission);
    },
    async findPreparation(sessionId) {
      return preparations.get(sessionId) ?? null;
    }
  };
}

test('only server-side preparation verification can make a session ready', async (t) => {
  const app = createApp({
    integrationKey,
    preparationWorkerKey,
    tokenSecret,
    repository: repository(),
    now: () => now
  });
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
    url: `/v1/internal/sessions/${created.session.id}/verify-preparation`,
    headers: { 'x-moodle-integration-key': integrationKey }
  });
  assert.equal(response.statusCode, 401);

  response = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${created.session.id}/preparation`,
    headers: { authorization: `Bearer ${created.browserToken}` },
    payload: {
      cameraPermissionGranted: true,
      faceCount: 1,
      faceInFrame: true,
      referenceCaptureId: 'reference-capture-1',
      identityVerified: true,
      liveness: {
        challengeId: created.preparation.livenessChallengeId,
        completed: true,
        passed: true
      }
    }
  });
  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.json(), { status: 'submitted' });

  response = await app.inject({
    method: 'GET',
    url: `/v1/internal/sessions/${created.session.id}/readiness`,
    headers: { 'x-moodle-integration-key': integrationKey }
  });
  assert.deepEqual(response.json(), { ready: false });

  response = await app.inject({
    method: 'POST',
    url: `/v1/internal/sessions/${created.session.id}/verify-preparation`,
    headers: { 'x-proctoring-worker-key': preparationWorkerKey }
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ready: true });

  response = await app.inject({
    method: 'GET',
    url: `/v1/internal/sessions/${created.session.id}/readiness`,
    headers: { 'x-moodle-integration-key': integrationKey }
  });
  assert.deepEqual(response.json(), { ready: true });
});
