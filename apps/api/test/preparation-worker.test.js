import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/app.js';

const integrationKey = 'moodle-integration-key';
const preparationWorkerKey = 'worker-integration-key';
const tokenSecret = 'test-token-secret-that-is-long-enough';
const now = new Date('2026-08-18T12:00:00.000Z');

function createRepository() {
  const sessions = new Map();
  const preparations = new Map();

  return {
    sessions,
    async create(session) {
      sessions.set(session.id, session);
      return session;
    },
    async findById(id) {
      return sessions.get(id) ?? null;
    },
    async savePreparation(submission) {
      preparations.set(submission.sessionId, submission);
    },
    async findPreparation(sessionId) {
      return preparations.get(sessionId) ?? null;
    },
    async consumeLivenessChallenge({ sessionId, challengeId, completedAt }) {
      const session = sessions.get(sessionId);
      if (!session || session.livenessChallengeId !== challengeId || session.livenessChallengeCompletedAt) {
        return false;
      }
      sessions.set(sessionId, { ...session, livenessChallengeCompletedAt: completedAt });
      return true;
    },
    async setStatus(id, status) {
      sessions.set(id, { ...sessions.get(id), status });
    }
  };
}

function sessionPayload(overrides = {}) {
  return {
    moodleUserId: 'student-1',
    moodleCourseId: 'course-1',
    moodleQuizId: 'quiz-1',
    moodleAttemptId: 'attempt-1',
    deviceMode: 'browser',
    issuedAt: '2026-08-18T12:00:00.000Z',
    expiresAt: '2026-08-18T13:00:00.000Z',
    ...overrides
  };
}

async function createSession(app, payload = sessionPayload()) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/internal/sessions',
    headers: { 'x-moodle-integration-key': integrationKey },
    payload
  });
  assert.equal(response.statusCode, 201);
  return response.json();
}

function validEvidence(livenessChallengeId) {
  return {
    cameraPermissionGranted: true,
    faceCount: 1,
    faceInFrame: true,
    referenceCaptureId: 'reference-capture-1',
    identityVerified: true,
    liveness: {
      challengeId: livenessChallengeId,
      completed: true,
      passed: true
    }
  };
}

function buildApp(repository = createRepository()) {
  return {
    app: createApp({
      integrationKey,
      preparationWorkerKey,
      repository,
      tokenSecret,
      now: () => now
    }),
    repository
  };
}

test('worker validates a complete preparation submission before marking the session ready', async (t) => {
  const { app, repository } = buildApp();
  t.after(() => app.close());
  const created = await createSession(app);

  const submitted = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${created.session.id}/preparation`,
    headers: { authorization: `Bearer ${created.browserToken}` },
    payload: validEvidence(created.preparation.livenessChallengeId)
  });
  assert.equal(submitted.statusCode, 202);

  const verified = await app.inject({
    method: 'POST',
    url: `/v1/internal/sessions/${created.session.id}/verify-preparation`,
    headers: { 'x-proctoring-worker-key': preparationWorkerKey }
  });
  assert.equal(verified.statusCode, 200);
  assert.deepEqual(verified.json(), { ready: true });

  assert.equal(repository.sessions.get(created.session.id).status, 'ready');
  assert.equal(repository.sessions.get(created.session.id).livenessChallengeCompletedAt, now.toISOString());
});

test('worker rejects incomplete preparation evidence without consuming its liveness challenge', async (t) => {
  const { app, repository } = buildApp();
  t.after(() => app.close());
  const created = await createSession(app);
  const evidence = validEvidence(created.preparation.livenessChallengeId);
  evidence.identityVerified = false;

  await app.inject({
    method: 'POST',
    url: `/v1/sessions/${created.session.id}/preparation`,
    headers: { authorization: `Bearer ${created.browserToken}` },
    payload: evidence
  });
  const verified = await app.inject({
    method: 'POST',
    url: `/v1/internal/sessions/${created.session.id}/verify-preparation`,
    headers: { 'x-proctoring-worker-key': preparationWorkerKey }
  });

  assert.equal(verified.statusCode, 409);
  assert.deepEqual(verified.json(), { ready: false, errors: ['identityVerified must be true'] });
  assert.equal(repository.sessions.get(created.session.id).status, 'created');
  assert.equal(repository.sessions.get(created.session.id).livenessChallengeCompletedAt, undefined);
});

test('worker refuses a liveness challenge issued for another session', async (t) => {
  const { app, repository } = buildApp();
  t.after(() => app.close());
  const first = await createSession(app, sessionPayload({ moodleAttemptId: 'attempt-1' }));
  const second = await createSession(app, sessionPayload({ moodleAttemptId: 'attempt-2' }));

  await app.inject({
    method: 'POST',
    url: `/v1/sessions/${second.session.id}/preparation`,
    headers: { authorization: `Bearer ${second.browserToken}` },
    payload: validEvidence(first.preparation.livenessChallengeId)
  });
  const verified = await app.inject({
    method: 'POST',
    url: `/v1/internal/sessions/${second.session.id}/verify-preparation`,
    headers: { 'x-proctoring-worker-key': preparationWorkerKey }
  });

  assert.equal(verified.statusCode, 409);
  assert.deepEqual(verified.json(), { ready: false, errors: ['liveness challenge does not match this session'] });
  assert.equal(repository.sessions.get(second.session.id).status, 'created');
  assert.equal(repository.sessions.get(second.session.id).livenessChallengeCompletedAt, undefined);
});

test('Moodle and browser credentials cannot activate a submitted session', async (t) => {
  const { app } = buildApp();
  t.after(() => app.close());
  const created = await createSession(app);

  const moodleAttempt = await app.inject({
    method: 'POST',
    url: `/v1/internal/sessions/${created.session.id}/verify-preparation`,
    headers: { 'x-moodle-integration-key': integrationKey }
  });
  assert.equal(moodleAttempt.statusCode, 401);

  const browserAttempt = await app.inject({
    method: 'POST',
    url: `/v1/internal/sessions/${created.session.id}/verify-preparation`,
    headers: { authorization: `Bearer ${created.browserToken}` }
  });
  assert.equal(browserAttempt.statusCode, 401);
});
