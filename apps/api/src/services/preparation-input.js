const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PreparationInputError extends Error {}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireExactKeys(value, keys, name) {
  if (!isPlainObject(value)) {
    throw new PreparationInputError(`${name} must be an object`);
  }
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new PreparationInputError(`${name} has invalid fields`);
  }
}

function requireUuid(value, name) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new PreparationInputError(`${name} must be a UUID`);
  }
  return value;
}

function parseBrowserLiveness(value) {
  requireExactKeys(value, ['challengeId', 'captureId'], 'liveness');
  return {
    challengeId: requireUuid(value.challengeId, 'liveness.challengeId'),
    captureId: requireUuid(value.captureId, 'liveness.captureId')
  };
}

export function parsePreparationSubmission(value) {
  requireExactKeys(value, ['referenceCaptureId', 'liveness'], 'preparation submission');
  return {
    referenceCaptureId: requireUuid(value.referenceCaptureId, 'referenceCaptureId'),
    liveness: parseBrowserLiveness(value.liveness)
  };
}

export function parseTrustedPreparationVerification(value) {
  requireExactKeys(
    value,
    ['submissionId', 'referenceCaptureId', 'identityVerified', 'liveness'],
    'preparation verification'
  );
  requireExactKeys(
    value.liveness,
    ['challengeId', 'captureId', 'completed', 'passed'],
    'verification liveness'
  );
  if (value.identityVerified !== true || value.liveness.completed !== true || value.liveness.passed !== true) {
    throw new PreparationInputError('trusted preparation verification must be successful');
  }
  return {
    submissionId: requireUuid(value.submissionId, 'submissionId'),
    referenceCaptureId: requireUuid(value.referenceCaptureId, 'referenceCaptureId'),
    identityVerified: true,
    liveness: {
      challengeId: requireUuid(value.liveness.challengeId, 'liveness.challengeId'),
      captureId: requireUuid(value.liveness.captureId, 'liveness.captureId'),
      completed: true,
      passed: true
    }
  };
}
