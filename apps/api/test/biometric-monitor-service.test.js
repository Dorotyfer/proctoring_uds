import assert from 'node:assert/strict';
import test from 'node:test';

import { createBiometricMonitorService } from '../src/services/biometric-monitor-service.js';

const input = {
  clientCheckId: '56cc96a8-2ff1-41ca-9917-dd967c297319',
  occurredAt: '2026-08-28T12:00:00.000Z',
  samples: [
    Array.from({ length: 1024 }, () => 0.1),
    Array.from({ length: 1024 }, () => 0.1),
    Array.from({ length: 1024 }, () => 0.1)
  ]
};

test('creates one mismatch alert only after all monitor samples fail', async () => {
  const incidents = [];
  const service = createBiometricMonitorService({
    biometricService: {
      async verifyContinuous() {
        return {
          checkId: 'check-1',
          mismatchedSamples: 3,
          profileVersionId: 'profile-version-1',
          similarity: 0.21,
          status: 'mismatch',
          threshold: 0.5
        };
      }
    },
    incidentService: {
      async record(sessionId, incident) {
        incidents.push({ sessionId, incident });
        return { alert: { id: 'alert-1' } };
      }
    },
    sessionService: {
      async getActive() {
        return { id: 'session-1', moodleUserId: 'student-1', status: 'active' };
      }
    }
  });

  const result = await service.check('session-1', input);

  assert.deepEqual(result.check, {
    alertId: 'alert-1',
    id: 'check-1',
    similarity: 0.21,
    status: 'mismatch',
    threshold: 0.5
  });
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].incident.type, 'biometric_monitor_mismatch');
  assert.equal(incidents[0].incident.metadata.profileVersionId, 'profile-version-1');
});

test('does not create an alert for a match or an unavailable profile', async () => {
  const incidents = [];
  const service = createBiometricMonitorService({
    biometricService: {
      async verifyContinuous() {
        return { checkId: 'check-2', similarity: 0.8, status: 'matched', threshold: 0.5 };
      }
    },
    incidentService: { async record() { incidents.push(true); } },
    sessionService: { async getActive() { return { id: 'session-1', status: 'active' }; } }
  });

  const result = await service.check('session-1', input);

  assert.equal(result.check.alertId, null);
  assert.equal(incidents.length, 0);
});
