import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { createSessionService } from '../src/services/session-service.js';

const payload = {
  moodleUserId: 'student-1',
  moodleCourseId: 'course-1',
  moodleQuizId: 'quiz-1',
  moodleAttemptId: 'attempt-1',
  courseName: 'Curso uno',
  quizName: 'Cuestionario uno',
  studentName: 'Estudiante Uno',
  studentDocument: '1234567',
  deviceMode: 'browser',
  issuedAt: '2026-08-19T10:00:00.000Z',
  expiresAt: '2026-08-19T10:30:00.000Z'
};

async function createTestApp() {
  const storedSession = {
    id: 'e3d9cce1-a5b8-4bfe-88e1-68a57475266d',
    status: 'pending',
    createdAt: payload.issuedAt,
    ...payload,
    expiresAt: '2099-08-19T10:30:00.000Z'
  };
  const sessionService = createSessionService({
    async create(input) {
      return { ...storedSession, ...input };
    },
    async findById(id) {
      return id === storedSession.id ? storedSession : null;
    },
    async complete(id) {
      return id === storedSession.id ? { ...storedSession, status: 'completed' } : null;
    },
    async activate(id) {
      return id === storedSession.id ? { ...storedSession, status: 'active' } : null;
    }
  }, {
    async storeIdentity() {
      return { id: '9afee813-b224-4ec7-9ea9-95d9bed1717e' };
    }
  });
  return buildApp({
    eventService: {},
    healthService: { async check() {} },
    jwtSecret: 'test-secret',
    moodleIntegrationKey: 'moodle-key',
    sessionService,
    logger: false
  });
}

test('creates an idempotent session reference for Moodle', async () => {
  const app = await createTestApp();
  const response = await app.inject({
    method: 'POST',
    url: '/v1/internal/sessions',
    headers: { 'x-moodle-integration-key': 'moodle-key' },
    payload
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().session.moodleAttemptId, 'attempt-1');
  assert.equal(response.json().browserToken, undefined);
  await app.close();
});

test('rejects missing integration keys and invalid inputs', async () => {
  const app = await createTestApp();
  const unauthorized = await app.inject({ method: 'POST', url: '/v1/internal/sessions', payload });
  const invalid = await app.inject({
    method: 'POST',
    url: '/v1/internal/sessions',
    headers: { 'x-moodle-integration-key': 'moodle-key' },
    payload: { ...payload, deviceMode: 'desktop' }
  });

  assert.equal(unauthorized.statusCode, 401);
  assert.equal(invalid.statusCode, 400);
  await app.close();
});

test('reports database health without exposing connection details', async () => {
  const app = await createTestApp();
  const response = await app.inject({ method: 'GET', url: '/health' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok', database: 'available' });
  await app.close();
});

test('renews a short-lived browser token without storing it in Moodle', async () => {
  const app = await createTestApp();
  const response = await app.inject({
    method: 'POST',
    url: '/v1/internal/sessions/e3d9cce1-a5b8-4bfe-88e1-68a57475266d/browser-token',
    headers: { 'x-moodle-integration-key': 'moodle-key' }
  });

  assert.equal(response.statusCode, 200);
  const claims = app.jwt.verify(response.json().browserToken);
  assert.equal(claims.sessionId, 'e3d9cce1-a5b8-4bfe-88e1-68a57475266d');
  assert.equal(claims.aud, 'proctoring-browser');
  await app.close();
});

test('lets Moodle confirm preparation status server to server', async () => {
  const app = await createTestApp();
  const response = await app.inject({
    method: 'POST',
    url: '/v1/internal/sessions/e3d9cce1-a5b8-4bfe-88e1-68a57475266d/status',
    headers: { 'x-moodle-integration-key': 'moodle-key' }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().session.status, 'pending');
  await app.close();
});

test('completes a remote session when Moodle finishes the attempt', async () => {
  const app = await createTestApp();
  const response = await app.inject({
    method: 'POST',
    url: '/v1/internal/sessions/e3d9cce1-a5b8-4bfe-88e1-68a57475266d/complete',
    headers: { 'x-moodle-integration-key': 'moodle-key' }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().session.status, 'completed');
  await app.close();
});

test('exposes only browser-safe session data and activates after successful checks', async () => {
  const app = await createTestApp();
  const token = app.jwt.sign({
    sessionId: 'e3d9cce1-a5b8-4bfe-88e1-68a57475266d',
    aud: 'proctoring-browser'
  });
  const headers = { authorization: `Bearer ${token}` };
  const session = await app.inject({
    method: 'GET',
    url: '/v1/sessions/e3d9cce1-a5b8-4bfe-88e1-68a57475266d',
    headers
  });
  const activation = await app.inject({
    method: 'POST',
    url: '/v1/sessions/e3d9cce1-a5b8-4bfe-88e1-68a57475266d/activate',
    headers,
    payload: {
      identityPassed: true,
      livenessPassed: true,
      livenessChallenge: ['blink', 'turn-left'],
      referenceCapture: `data:image/jpeg;base64,${Buffer.from('jpeg').toString('base64')}`
    }
  });

  assert.equal(session.statusCode, 200);
  assert.equal(session.json().session.moodleUserId, undefined);
  assert.equal(activation.statusCode, 200);
  assert.equal(activation.json().session.status, 'active');
  await app.close();
});
