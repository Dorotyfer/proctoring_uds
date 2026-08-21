import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { createBiometricEncryptionService } from '../src/services/biometric-encryption-service.js';
import {
  BiometricConsentRequiredError,
  createBiometricProfileService
} from '../src/services/biometric-profile-service.js';
import { BIOMETRIC_DESCRIPTOR_LENGTH } from '../src/services/biometric-matching-service.js';

const userId = 'moodle-student-1';

function descriptor(value) {
  return Array.from({ length: BIOMETRIC_DESCRIPTOR_LENGTH }, () => value);
}

function createRepository() {
  const state = { audits: [], checks: new Map(), profile: null };

  return {
    state,
    async findByUserId() {
      return state.profile;
    },
    async withUserLock(_moodleUserId, callback) {
      const transaction = {
        findCheckBySessionId: async (sessionId) => state.checks.get(sessionId) ?? null,
        getProfile: async () => state.profile,
        insertCheck: async (input) => {
          const check = { id: crypto.randomUUID(), ...input };
          state.checks.set(input.sessionId, check);
          return check;
        },
        insertProfile: async (input) => {
          state.profile = { id: crypto.randomUUID(), ...input };
          return state.profile;
        },
        recordAudit: async (input) => {
          state.audits.push(input);
        },
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

function createService(repository) {
  return createBiometricProfileService({
    encryptionService: createBiometricEncryptionService(Buffer.alloc(32, 7)),
    repository,
    threshold: 0.5
  });
}

test('enrolls a Moodle account only after explicit consent', async () => {
  const repository = createRepository();
  const service = createService(repository);

  await assert.rejects(
    service.enrollOrVerify({
      biometricConsentAccepted: false,
      biometricSamples: [descriptor(0.1), descriptor(0.1), descriptor(0.1)],
      moodleUserId: userId,
      sessionId: 'session-1'
    }),
    BiometricConsentRequiredError
  );

  const result = await service.enrollOrVerify({
    biometricConsentAccepted: true,
    biometricSamples: [descriptor(0.1), descriptor(0.1), descriptor(0.1)],
    moodleUserId: userId,
    sessionId: 'session-1'
  });

  assert.equal(result.status, 'enrolled');
  assert.equal(repository.state.profile.status, 'active');
  assert.notDeepEqual(repository.state.profile.descriptorCiphertext, descriptor(0.1));
  assert.equal(repository.state.audits[0].action, 'enroll');
});

test('matches a later attempt without replacing the enrolled profile', async () => {
  const repository = createRepository();
  const service = createService(repository);
  await service.enrollOrVerify({
    biometricConsentAccepted: true,
    biometricSamples: [descriptor(0.1), descriptor(0.1), descriptor(0.1)],
    moodleUserId: userId,
    sessionId: 'session-1'
  });
  const enrolledCiphertext = repository.state.profile.descriptorCiphertext;

  const result = await service.enrollOrVerify({
    biometricConsentAccepted: false,
    biometricSamples: [descriptor(0.1), descriptor(0.1), descriptor(0.1)],
    moodleUserId: userId,
    sessionId: 'session-2'
  });

  assert.equal(result.status, 'matched');
  assert.deepEqual(repository.state.profile.descriptorCiphertext, enrolledCiphertext);
});

test('reports a mismatch while keeping the enrolled profile unchanged', async () => {
  const repository = createRepository();
  const service = createService(repository);
  await service.enrollOrVerify({
    biometricConsentAccepted: true,
    biometricSamples: [descriptor(0.1), descriptor(0.1), descriptor(0.1)],
    moodleUserId: userId,
    sessionId: 'session-1'
  });
  const enrolledVersion = repository.state.profile.enrollmentVersion;

  const result = await service.enrollOrVerify({
    biometricConsentAccepted: false,
    biometricSamples: [descriptor(0.9), descriptor(0.9), descriptor(0.9)],
    moodleUserId: userId,
    sessionId: 'session-2'
  });

  assert.equal(result.status, 'mismatch');
  assert.equal(result.mismatchedSamples, 3);
  assert.equal(repository.state.profile.enrollmentVersion, enrolledVersion);
});

test('returns the persisted result when the same session retries activation', async () => {
  const repository = createRepository();
  const service = createService(repository);
  const input = {
    biometricConsentAccepted: true,
    biometricSamples: [descriptor(0.1), descriptor(0.1), descriptor(0.1)],
    moodleUserId: userId,
    sessionId: 'session-1'
  };

  const first = await service.enrollOrVerify(input);
  const second = await service.enrollOrVerify(input);

  assert.equal(second.status, first.status);
  assert.equal(repository.state.checks.size, 1);
});
