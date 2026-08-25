import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { BiometricConsentRequiredError } from '../src/services/biometric-profile-service.js';
import { BIOMETRIC_DESCRIPTOR_LENGTH } from '../src/services/biometric-matching-service.js';

const sessionId = 'e3d9cce1-a5b8-4bfe-88e1-68a57475266d';
const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9]).toString('base64')}`;
const samples = Array.from({ length: 3 }, () => Array.from({ length: BIOMETRIC_DESCRIPTOR_LENGTH }, () => 0.1));

function createApp(overrides = {}) {
  const session = {
    deviceMode: 'browser',
    expiresAt: '2099-08-19T10:30:00.000Z',
    id: sessionId,
    issuedAt: '2026-08-19T10:00:00.000Z',
    moodleUserId: 'student-1',
    status: 'pending'
  };
  const incidentCalls = [];
  const appOptions = {
    biometricService: {
      async getStatus() {
        return { enrollmentVersion: null, state: 'unregistered' };
      }
    },
    eventService: {},
    evidenceService: {},
    healthService: { async check() {} },
    incidentService: {
      async record(id, input) {
        incidentCalls.push({ id, input });
        return { alert: { id: 'alert-1' }, event: { id: id } };
      }
    },
    jwtSecret: 'test-secret',
    sessionService: {
      async getActive() {
        return session;
      },
      async activate() {
        return {
          biometric: {
            alertId: null,
            enrollmentVersion: 1,
            mismatchedSamples: 3,
            similarity: 0,
            status: 'mismatch',
            threshold: 0.5
          },
          session: { ...session, status: 'active' }
        };
      }
    },
    logger: false,
    moodleIntegrationKey: 'moodle-key',
    ...overrides
  };
  return buildApp(appOptions).then((app) => ({ app, incidentCalls }));
}

test('returns the account biometric state without exposing a descriptor', async () => {
  const { app } = await createApp();
  const token = app.jwt.sign({ aud: 'proctoring-browser', sessionId });

  const response = await app.inject({
    method: 'GET',
    url: `/v1/sessions/${sessionId}`,
    headers: { authorization: `Bearer ${token}` }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().session.biometric, { enrollmentVersion: null, state: 'unregistered' });
  assert.equal(JSON.stringify(response.json()).includes('embedding'), false);
  await app.close();
});

test('creates one idempotent high-severity biometric alert for a mismatch', async () => {
  const { app, incidentCalls } = await createApp();
  const token = app.jwt.sign({ aud: 'proctoring-browser', sessionId });
  const headers = { authorization: `Bearer ${token}` };
  const payload = {
    biometricConsentAccepted: false,
    biometricSamples: samples,
    identityPassed: true,
    livenessChallenge: ['blink', 'turn-left'],
    livenessPassed: true,
    referenceCapture: jpeg
  };

  const first = await app.inject({ method: 'POST', url: `/v1/sessions/${sessionId}/activate`, headers, payload });
  const second = await app.inject({ method: 'POST', url: `/v1/sessions/${sessionId}/activate`, headers, payload });

  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.json().biometric, { alertId: 'alert-1', status: 'mismatch' });
  assert.equal(second.statusCode, 200);
  assert.equal(incidentCalls[0].input.type, 'biometric_mismatch');
  assert.equal(incidentCalls[0].input.clientEventId, sessionId);
  await app.close();
});

test('returns a retryable consent response before first enrollment', async () => {
  const { app } = await createApp({
    biometricService: {},
    sessionService: {
      async getActive() {
        return {
          deviceMode: 'browser',
          expiresAt: '2099-08-19T10:30:00.000Z',
          id: sessionId,
          issuedAt: '2026-08-19T10:00:00.000Z',
          moodleUserId: 'student-1',
          status: 'pending'
        };
      },
      async activate() {
        throw new BiometricConsentRequiredError('Biometric consent is required before enrollment');
      }
    }
  });
  const token = app.jwt.sign({ aud: 'proctoring-browser', sessionId });

  const response = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${sessionId}/activate`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      biometricConsentAccepted: false,
      biometricSamples: samples,
      identityPassed: true,
      livenessChallenge: ['blink', 'turn-left'],
      livenessPassed: true,
      referenceCapture: jpeg
    }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, 'biometric_consent_required');
  await app.close();
});

test('rejects biometric activation when the public API requires HTTPS', async () => {
  const { app } = await createApp({ requireHttps: true });
  const token = app.jwt.sign({ aud: 'proctoring-browser', sessionId });

  const response = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${sessionId}/activate`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      biometricConsentAccepted: true,
      biometricSamples: samples,
      identityPassed: true,
      livenessChallenge: ['blink', 'turn-left'],
      livenessPassed: true,
      referenceCapture: jpeg
    }
  });

  assert.equal(response.statusCode, 400);
  await app.close();
});
