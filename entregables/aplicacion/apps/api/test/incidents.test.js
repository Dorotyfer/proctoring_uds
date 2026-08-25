import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { createIncidentService } from '../src/services/incident-service.js';

const sessionId = 'e3d9cce1-a5b8-4bfe-88e1-68a57475266d';
const eventId = '56cc96a8-2ff1-41ca-9917-dd967c297319';
const alertId = '66cc96a8-2ff1-41ca-9917-dd967c297319';
const evidenceId = '76cc96a8-2ff1-41ca-9917-dd967c297319';
const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9]);

test('stores an incident capture through the authenticated endpoint', async () => {
  const received = [];
  const app = await buildApp({
    eventService: {},
    healthService: { async check() {} },
    incidentService: {
      async record(receivedSessionId, input) {
        received.push({ receivedSessionId, input });
        return {
          alert: { id: alertId, status: 'open' },
          event: { id: eventId },
          evidence: { id: evidenceId }
        };
      }
    },
    jwtSecret: 'test-jwt-secret-with-at-least-32-characters',
    moodleIntegrationKey: 'test-moodle-key',
    sessionService: {},
    logger: false
  });
  const token = app.jwt.sign({ sessionId, aud: 'proctoring-browser' });
  const capture = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;

  const response = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${sessionId}/incidents`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      capture,
      clientEventId: '86cc96a8-2ff1-41ca-9917-dd967c297319',
      metadata: { faceState: 'absent' },
      occurredAt: new Date().toISOString(),
      type: 'face_absent'
    }
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), {
    incident: {
      alertId,
      evidenceId,
      eventId,
      status: 'open'
    }
  });
  assert.equal(received[0].receivedSessionId, sessionId);
  assert.deepEqual(received[0].input.capture, jpegBuffer);

  const invalidCapture = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${sessionId}/incidents`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      capture: `data:image/jpeg;base64,${Buffer.from('not-a-jpeg').toString('base64')}`,
      clientEventId: 'b6cc96a8-2ff1-41ca-9917-dd967c297319',
      metadata: {},
      occurredAt: new Date().toISOString(),
      type: 'face_absent'
    }
  });

  assert.equal(invalidCapture.statusCode, 400);

  const invalid = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${sessionId}/incidents`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      capture,
      clientEventId: 'a6cc96a8-2ff1-41ca-9917-dd967c297319',
      metadata: {},
      occurredAt: new Date().toISOString(),
      type: 'network_reconnected'
    }
  });

  assert.equal(invalid.statusCode, 400);
  await app.close();
});

test('replays an incident without creating a second evidence record', async () => {
  let evidenceWrites = 0;
  let evidence = null;
  const service = createIncidentService(
    { async record() {
      return {
        alert: { id: alertId, status: 'open' },
        event: { id: eventId, sessionId, type: 'face_absent' }
      };
    } },
    {
      async findByEventId() { return evidence; }
    },
    {
      async storeCapture() {
        evidenceWrites += 1;
        evidence = { id: evidenceId, eventId };
        return evidence;
      }
    }
  );
  const input = {
    capture: jpegBuffer,
    clientEventId: '96cc96a8-2ff1-41ca-9917-dd967c297319',
    metadata: {},
    occurredAt: new Date().toISOString(),
    type: 'face_absent'
  };

  const first = await service.record(sessionId, input);
  const second = await service.record(sessionId, input);

  assert.equal(first.evidence.id, evidenceId);
  assert.equal(second.evidence.id, evidenceId);
  assert.equal(evidenceWrites, 1);
});
