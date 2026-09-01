import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { createBiometricEncryptionService } from '../src/services/biometric-encryption-service.js';
import { createBiometricProfileService } from '../src/services/biometric-profile-service.js';
import { BIOMETRIC_DESCRIPTOR_LENGTH } from '../src/services/biometric-matching-service.js';

function descriptor(value) {
  return Array.from({ length: BIOMETRIC_DESCRIPTOR_LENGTH }, () => value);
}

function createVersionedRepository() {
  const state = {
    audits: [],
    checks: new Map(),
    monitorChecks: new Map(),
    profile: null,
    versions: []
  };

  return {
    state,
    async withUserLock(_userId, callback) {
      const transaction = {
        findCheckBySessionId: async (sessionId) => state.checks.get(sessionId) ?? null,
        findMonitorCheck: async (sessionId, clientCheckId) =>
          state.monitorChecks.get(`${sessionId}:${clientCheckId}`) ?? null,
        getProfile: async () => {
          const active = state.versions.find((version) => version.status === 'active');
          return state.profile ? {
            ...state.profile,
            activeVersionId: active?.id ?? null,
            descriptorCiphertext: active?.descriptorCiphertext,
            descriptorLength: active?.descriptorLength,
            encryptionIv: active?.encryptionIv,
            encryptionTag: active?.encryptionTag,
            enrollmentVersion: active?.version ?? state.profile.enrollmentVersion
          } : null;
        },
        insertCheck: async (input) => {
          const check = { id: crypto.randomUUID(), ...input };
          state.checks.set(input.sessionId, check);
          return check;
        },
        insertMonitorCheck: async (input) => {
          const check = { id: crypto.randomUUID(), ...input };
          state.monitorChecks.set(`${input.sessionId}:${input.clientCheckId}`, check);
          return check;
        },
        insertProfile: async (input) => {
          state.profile = { id: crypto.randomUUID(), ...input };
          return state.profile;
        },
        insertProfileVersion: async (input) => {
          const version = { id: crypto.randomUUID(), ...input, status: 'pending' };
          state.versions.push(version);
          return version;
        },
        activateProfileVersion: async (versionId) => {
          state.versions.forEach((version) => {
            version.status = version.id === versionId ? 'active' : 'revoked';
          });
          state.profile.activeVersionId = versionId;
        },
        revokeProfileVersion: async (versionId) => {
          const version = state.versions.find((item) => item.id === versionId);
          if (version) version.status = 'revoked';
        },
        recordAudit: async (input) => state.audits.push(input),
        updateProfile: async (input) => {
          state.profile = { ...state.profile, ...input };
          return state.profile;
        },
        updateVerifiedAt: async () => {}
      };
      return callback(transaction);
    }
  };
}

test('creates and activates a new biometric version while revoking the old one', async () => {
  const repository = createVersionedRepository();
  const service = createBiometricProfileService({
    encryptionService: createBiometricEncryptionService(Buffer.alloc(32, 7)),
    repository,
    threshold: 0.5
  });

  const first = await service.enrollOrVerify({
    biometricConsentAccepted: true,
    biometricSamples: [descriptor(0.1), descriptor(0.1), descriptor(0.1)],
    moodleUserId: 'student-1',
    sessionId: 'session-1'
  });
  repository.state.profile.status = 'revoked';
  const second = await service.enrollOrVerify({
    biometricConsentAccepted: true,
    biometricSamples: [descriptor(0.2), descriptor(0.2), descriptor(0.2)],
    moodleUserId: 'student-1',
    sessionId: 'session-2'
  });

  assert.notEqual(second.profileVersionId, first.profileVersionId);
  assert.equal(repository.state.versions.filter((version) => version.status === 'active').length, 1);
  assert.equal(repository.state.versions.find((version) => version.id === first.profileVersionId).status, 'revoked');
  assert.equal(repository.state.audits.at(-1).profileVersionId, second.profileVersionId);
});

test('verifies continuous samples against the active version and is idempotent by client check', async () => {
  const repository = createVersionedRepository();
  const service = createBiometricProfileService({
    encryptionService: createBiometricEncryptionService(Buffer.alloc(32, 7)),
    repository,
    threshold: 0.5
  });
  await service.enrollOrVerify({
    biometricConsentAccepted: true,
    biometricSamples: [descriptor(0.1), descriptor(0.1), descriptor(0.1)],
    moodleUserId: 'student-1',
    sessionId: 'activation-1'
  });

  const input = {
    biometricSamples: [descriptor(0.9), descriptor(0.9), descriptor(0.9)],
    clientCheckId: 'check-client-1',
    moodleUserId: 'student-1',
    sessionId: 'session-2'
  };
  const first = await service.verifyContinuous(input);
  const second = await service.verifyContinuous(input);

  assert.equal(first.status, 'mismatch');
  assert.equal(first.profileVersionId, repository.state.profile.activeVersionId);
  assert.deepEqual(second, first);
  assert.equal(repository.state.monitorChecks.size, 1);
});
