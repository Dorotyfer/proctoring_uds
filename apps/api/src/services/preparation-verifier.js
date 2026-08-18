function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function createPreparationVerifier() {
  return {
    verify(submission, session) {
      const evidence = submission.evidence;
      const errors = [];

      if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
        return { valid: false, errors: ['preparation evidence must be an object'] };
      }
      if (evidence.cameraPermissionGranted !== true) {
        errors.push('cameraPermissionGranted must be true');
      }
      if (evidence.faceCount !== 1) {
        errors.push('faceCount must equal 1');
      }
      if (evidence.faceInFrame !== true) {
        errors.push('faceInFrame must be true');
      }
      if (!isNonEmptyString(evidence.referenceCaptureId)) {
        errors.push('referenceCaptureId is required');
      }
      if (evidence.identityVerified !== true) {
        errors.push('identityVerified must be true');
      }

      const liveness = evidence.liveness;
      if (!liveness || typeof liveness !== 'object' || Array.isArray(liveness)) {
        errors.push('liveness is required');
      } else {
        if (liveness.challengeId !== session.livenessChallengeId) {
          errors.push('liveness challenge does not match this session');
        }
        if (liveness.completed !== true) {
          errors.push('liveness challenge must be completed');
        }
        if (liveness.passed !== true) {
          errors.push('liveness challenge must pass');
        }
      }

      return { valid: errors.length === 0, errors };
    }
  };
}
