import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { createBiometricMonitorService } from '../src/services/biometric-monitor-service.js';

const sessionId = 'e3d9cce1-a5b8-4bfe-88e1-68a57475266d';
const payload = {
  clientCheckId: '56cc96a8-2ff1-41ca-9917-dd967c297319',
  occurredAt: '2026-08-28T12:00:00.000Z',
  samples: Array.from({ length: 3 }, () => Array.from({ length: 1024 }, () => 0.1))
};

test('accepts continuous biometric checks and returns only safe check data', async () => {
  const app = await buildApp({
    biometricMonitorService: createBiometricMonitorService({
      biometricService: {
        async verifyContinuous() {
          return { checkId: 'check-1', similarity: 0.82, status: 'matched', threshold: 0.5 };
        }
      },
      sessionService: {
        async getActive() {
          return { id: sessionId, moodleUserId: 'student-1', status: 'active' };
        }
      }
    }),
    eventService: {},
    healthService: { async check() {} },
    incidentService: null,
    jwtSecret: 'test-secret',
    sessionService: { async getActive() { return null; } },
    logger: false
  });
  const token = app.jwt.sign({ aud: 'proctoring-browser', sessionId });

  const response = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${sessionId}/biometric-checks`,
    headers: { authorization: `Bearer ${token}` },
    payload
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    check: { alertId: null, id: 'check-1', similarity: 0.82, status: 'matched', threshold: 0.5 }
  });
  assert.equal(response.body.includes('0.1'), false);
  await app.close();
});

test('rejects monitor payloads that do not contain exactly three valid descriptors', async () => {
  const app = await buildApp({
    biometricMonitorService: createBiometricMonitorService({
      biometricService: {},
      sessionService: { async getActive() { return { id: sessionId, moodleUserId: 'student-1' }; } }
    }),
    eventService: {},
    healthService: { async check() {} },
    jwtSecret: 'test-secret',
    sessionService: { async getActive() { return null; } },
    logger: false
  });
  const token = app.jwt.sign({ aud: 'proctoring-browser', sessionId });

  const response = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${sessionId}/biometric-checks`,
    headers: { authorization: `Bearer ${token}` },
    payload: { ...payload, samples: [payload.samples[0]] }
  });

  assert.equal(response.statusCode, 400);
  await app.close();
});
