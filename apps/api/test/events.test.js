import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';

const sessionId = 'e3d9cce1-a5b8-4bfe-88e1-68a57475266d';
const otherSessionId = 'cf648229-b07d-4f38-a964-88e5010df6d2';
const event = {
  clientEventId: '56cc96a8-2ff1-41ca-9917-dd967c297319',
  type: 'camera_interrupted',
  occurredAt: new Date().toISOString(),
  metadata: { source: 'camera-track' }
};

async function createTestApp() {
  const eventService = {
    async record(receivedSessionId, input) {
      return {
        id: '3a60ebc0-c0be-4a2d-a2ce-a49cd9e2f20f',
        sessionId: receivedSessionId,
        receivedAt: new Date().toISOString(),
        ...input
      };
    }
  };
  return buildApp({
    eventService,
    healthService: { async check() {} },
    jwtSecret: 'test-secret',
    moodleIntegrationKey: 'moodle-key',
    sessionService: {},
    logger: false
  });
}

test('accepts an event only for the token session', async () => {
  const app = await createTestApp();
  const token = app.jwt.sign({ sessionId, aud: 'proctoring-browser' });
  const response = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${sessionId}/events`,
    headers: { authorization: `Bearer ${token}` },
    payload: event
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().event.type, 'camera_interrupted');
  await app.close();
});

test('rejects missing tokens and tokens for another session', async () => {
  const app = await createTestApp();
  const token = app.jwt.sign({ sessionId, aud: 'proctoring-browser' });
  const missing = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${sessionId}/events`,
    payload: event
  });
  const foreign = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${otherSessionId}/events`,
    headers: { authorization: `Bearer ${token}` },
    payload: event
  });

  assert.equal(missing.statusCode, 401);
  assert.equal(foreign.statusCode, 403);
  await app.close();
});
