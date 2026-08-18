import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/app.js';

const environment = {
  MOODLE_INTEGRATION_KEY: 'moodle-integration-key',
  WORKER_INTEGRATION_KEY: 'worker-integration-key'
};
const integrationKey = environment.MOODLE_INTEGRATION_KEY;
const preparationWorkerKey = environment.WORKER_INTEGRATION_KEY;
const tokenSecret = 'test-token-secret-that-is-long-enough';
const now = new Date('2026-08-18T12:00:00.000Z');
const referenceCaptureId = 'c7c2d6c9-36ab-4a3f-afde-1f6e6e0f4811';
const livenessCaptureId = '42d9b1ea-81d2-4de6-a725-dced4bc431f0';

function createRepository() {
  const sessions = new Map();
  const preparations = new Map();
  const trustedPreparations = new Map();

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
      if (preparations.has(submission.sessionId)) {
        return false;
      }
      preparations.set(submission.sessionId, submission);
      return true;
    },
    async findPreparation(sessionId) {
      return preparations.get(sessionId) ?? null;
    },
    async saveTrustedPreparation(verification) {
      if (trustedPreparations.has(verification.sessionId)) {
        return false;
      }
      trustedPreparations.set(verification.sessionId, verification);
      return true;
    },
    async findTrustedPreparation(sessionId) {
      return trustedPreparations.get(sessionId) ?? null;
    },
    async markPreparationReady({ sessionId, challengeId, completedAt }) {
      const session = sessions.get(sessionId);
      if (
        !session ||
        session.status !== 'created' ||
        session.livenessChallengeId !== challengeId ||
        session.livenessChallengeCompletedAt
      ) {
        return false;
      }
      sessions.set(sessionId, {
        ...session,
        status: 'ready',
        livenessChallengeCompletedAt: completedAt
      });
      return true;
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

function browserEvidence(livenessChallengeId) {
  return {
    referenceCaptureId,
    liveness: {
      challengeId: livenessChallengeId,
      captureId: livenessCaptureId
    }
  };
}

function workerVerification(submissionId, livenessChallengeId) {
  return {
    submissionId,
    referenceCaptureId,
    identityVerified: true,
    liveness: {
      challengeId: livenessChallengeId,
      captureId: livenessCaptureId,
      completed: true,
      passed: true
    }
  };
}

function buildApp(repository = createRepository()) {
  return {
    app: createApp({ environment, repository, tokenSecret, now: () => now }),
    repository
  };
}

async function submitBrowserEvidence(app, created) {
  const response = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${created.session.id}/preparation`,
    headers: { authorization: `Bearer ${created.browserToken}` },
    payload: browserEvidence(created.preparation.livenessChallengeId)
  });
  assert.equal(response.statusCode, 202);
  return response.json();
}

async function recordTrustedVerification(app, created, submission) {
  const response = await app.inject({
    method: 'POST',
    url: `/v1/internal/sessions/${created.session.id}/preparation-verification`,
    headers: { 'x-proctoring-worker-key': preparationWorkerKey },
    payload: workerVerification(submission.submissionId, created.preparation.livenessChallengeId)
  });
  assert.equal(response.statusCode, 201);
}

async function verifyPreparation(app, sessionId) {
  return app.inject({
    method: 'POST',
    url: `/v1/internal/sessions/${sessionId}/verify-preparation`,
    headers: { 'x-proctoring-worker-key': preparationWorkerKey }
  });
}

test('forged browser all-true JSON is rejected and cannot make a session ready', async (t) => {
  const { app, repository } = buildApp();
  t.after(() => app.close());
  const created = await createSession(app);
  const forged = {
    ...browserEvidence(created.preparation.livenessChallengeId),
    cameraPermissionGranted: true,
    faceCount: 1,
    faceInFrame: true,
    identityVerified: true,
    liveness: {
      ...browserEvidence(created.preparation.livenessChallengeId).liveness,
      completed: true,
      passed: true
    }
  };

  const submission = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${created.session.id}/preparation`,
    headers: { authorization: `Bearer ${created.browserToken}` },
    payload: forged
  });
  assert.equal(submission.statusCode, 400);

  const verification = await verifyPreparation(app, created.session.id);
  assert.equal(verification.statusCode, 409);
  assert.equal(repository.sessions.get(created.session.id).status, 'created');
});

test('worker marks a session ready only from a trusted verification bound to immutable browser evidence', async (t) => {
  const { app, repository } = buildApp();
  t.after(() => app.close());
  const created = await createSession(app);
  const submission = await submitBrowserEvidence(app, created);

  let verification = await verifyPreparation(app, created.session.id);
  assert.equal(verification.statusCode, 409);
  assert.deepEqual(verification.json(), {
    ready: false,
    errors: ['trusted preparation verification was not found']
  });

  await recordTrustedVerification(app, created, submission);
  verification = await verifyPreparation(app, created.session.id);
  assert.equal(verification.statusCode, 200);
  assert.deepEqual(verification.json(), { ready: true });
  assert.equal(repository.sessions.get(created.session.id).status, 'ready');
  assert.equal(repository.sessions.get(created.session.id).livenessChallengeCompletedAt, now.toISOString());
});

test('preparation input rejects unknown fields and cannot be replaced after verification', async (t) => {
  const { app } = buildApp();
  t.after(() => app.close());
  const created = await createSession(app);

  const malformed = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${created.session.id}/preparation`,
    headers: { authorization: `Bearer ${created.browserToken}` },
    payload: {
      ...browserEvidence(created.preparation.livenessChallengeId),
      ignored: 'x'.repeat(128 * 1024)
    }
  });
  assert.equal(malformed.statusCode, 400);

  const invalidCapture = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${created.session.id}/preparation`,
    headers: { authorization: `Bearer ${created.browserToken}` },
    payload: {
      ...browserEvidence(created.preparation.livenessChallengeId),
      referenceCaptureId: 'not-a-uuid'
    }
  });
  assert.equal(invalidCapture.statusCode, 400);

  const submission = await submitBrowserEvidence(app, created);
  await recordTrustedVerification(app, created, submission);
  const verification = await verifyPreparation(app, created.session.id);
  assert.equal(verification.statusCode, 200);

  const replaced = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${created.session.id}/preparation`,
    headers: { authorization: `Bearer ${created.browserToken}` },
    payload: browserEvidence(created.preparation.livenessChallengeId)
  });
  assert.equal(replaced.statusCode, 409);
});

test('only one concurrent worker verification can transition a created session', async (t) => {
  const { app, repository } = buildApp();
  t.after(() => app.close());
  const created = await createSession(app);
  const submission = await submitBrowserEvidence(app, created);
  await recordTrustedVerification(app, created, submission);

  const results = await Promise.all([
    verifyPreparation(app, created.session.id),
    verifyPreparation(app, created.session.id)
  ]);
  assert.deepEqual(results.map((response) => response.statusCode).sort(), [200, 409]);
  assert.equal(repository.sessions.get(created.session.id).status, 'ready');
});

test('a competing terminal lifecycle status blocks readiness without consuming the challenge', async (t) => {
  const { app, repository } = buildApp();
  t.after(() => app.close());
  const created = await createSession(app);
  const submission = await submitBrowserEvidence(app, created);
  await recordTrustedVerification(app, created, submission);
  repository.sessions.set(created.session.id, {
    ...repository.sessions.get(created.session.id),
    status: 'expired'
  });

  const verification = await verifyPreparation(app, created.session.id);
  assert.equal(verification.statusCode, 409);
  assert.equal(repository.sessions.get(created.session.id).status, 'expired');
  assert.equal(repository.sessions.get(created.session.id).livenessChallengeCompletedAt, undefined);
});

test('Moodle and browser credentials cannot activate or record a trusted verification', async (t) => {
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
    url: `/v1/internal/sessions/${created.session.id}/preparation-verification`,
    headers: { authorization: `Bearer ${created.browserToken}` },
    payload: {}
  });
  assert.equal(browserAttempt.statusCode, 401);
});
