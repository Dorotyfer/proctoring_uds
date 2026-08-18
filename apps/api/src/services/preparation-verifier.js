export function createPreparationVerifier() {
  return {
    verify(submission, trustedPreparation, session) {
      const evidence = submission.evidence;
      const errors = [];

      if (!trustedPreparation) {
        return { valid: false, errors: ['trusted preparation verification was not found'] };
      }
      if (trustedPreparation.submissionId !== submission.id) {
        errors.push('trusted preparation verification does not match this submission');
      }
      if (trustedPreparation.referenceCaptureId !== evidence.referenceCaptureId) {
        errors.push('trusted reference capture does not match this submission');
      }
      if (trustedPreparation.liveness.challengeId !== session.livenessChallengeId) {
        errors.push('trusted liveness challenge does not match this session');
      }
      if (trustedPreparation.liveness.challengeId !== evidence.liveness.challengeId) {
        errors.push('trusted liveness challenge does not match this submission');
      }
      if (trustedPreparation.liveness.captureId !== evidence.liveness.captureId) {
        errors.push('trusted liveness capture does not match this submission');
      }

      return { valid: errors.length === 0, errors };
    }
  };
}
