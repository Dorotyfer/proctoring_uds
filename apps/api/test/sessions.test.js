import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/app.js';
import { verifyBrowserToken } from '../src/services/token-service.js';

const integrationKey = 'test-integration-key';
const tokenSecret = 'test-token-secret-that-is-long-enough';
const now = new Date('2026-08-18T12:00:00.000Z');

function createSessionPayload(overrides = {}) {
  return {
    moodleUserId: 'user-42',
    moodleCourseId: 'course-17',
    moodleQuizId: 'quiz-3',
    moodleAttemptId: 'attempt-9',
    deviceMode: 'browser',
    issuedAt: '2026-08-18T12:00:00.000Z',
    expiresAt: '2026-08-18T13:00:00.000Z',
    ...overrides
  };
}

function createRepository() {
  const sessions = [];

  return {
    sessions,
    async create(session) {
      sessions.push(session);
      return session;
    }
  };
}

function buildApp(repository = createRepository()) {
  return {
    app: createApp({ integrationKey, repository, tokenSecret, now: () => now }),
    repository
  };
}

test('creates and persists a signed browser session for an authorized Moodle request', async (t) => {
  const { app, repository } = buildApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/v1/internal/sessions',
    headers: { 'x-moodle-integration-key': integrationKey },
    payload: createSessionPayload()
  });

  assert.equal(response.statusCode, 201);
  const body = response.json();
  assert.match(body.session.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.deepEqual(body.session, {
    id: body.session.id,
    moodleUserId: 'user-42',
    moodleCourseId: 'course-17',
    moodleQuizId: 'quiz-3',
    moodleAttemptId: 'attempt-9',
    deviceMode: 'browser',
    status: 'created',
    issuedAt: '2026-08-18T12:00:00.000Z',
    expiresAt: '2026-08-18T13:00:00.000Z',
    createdAt: '2026-08-18T12:00:00.000Z'
  });
  assert.deepEqual(repository.sessions, [body.session]);

  const claims = verifyBrowserToken(body.browserToken, tokenSecret, { now });
  assert.deepEqual(claims, {
    sessionId: body.session.id,
    moodleAttemptId: 'attempt-9',
    deviceMode: 'browser',
    aud: 'proctoring-browser',
    expiresAt: '2026-08-18T12:15:00.000Z'
  });
});

test('rejects a session request with an invalid device mode', async (t) => {
  const { app, repository } = buildApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/v1/internal/sessions',
    headers: { 'x-moodle-integration-key': integrationKey },
    payload: createSessionPayload({ deviceMode: 'desktop-app' })
  });

  assert.equal(response.statusCode, 400);
  assert.equal(repository.sessions.length, 0);
});

test('rejects a session request without the Moodle integration key', async (t) => {
  const { app, repository } = buildApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/v1/internal/sessions',
    payload: createSessionPayload()
  });

  assert.equal(response.statusCode, 401);
  assert.equal(repository.sessions.length, 0);
  assert.deepEqual(response.json(), { error: 'Unauthorized' });
});

test('rejects a browser token after its fifteen-minute expiration', () => {
  const { app } = buildApp();

  return app.inject({
    method: 'POST',
    url: '/v1/internal/sessions',
    headers: { 'x-moodle-integration-key': integrationKey },
    payload: createSessionPayload()
  }).then((response) => {
    assert.equal(response.statusCode, 201);
    assert.throws(
      () => verifyBrowserToken(response.json().browserToken, tokenSecret, {
        now: new Date('2026-08-18T12:15:01.000Z')
      }),
      /expired/
    );
    return app.close();
  });
});
