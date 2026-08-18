import { randomUUID } from 'node:crypto';

import {
  parsePreparationSubmission,
  parseTrustedPreparationVerification
} from './preparation-input.js';

export class PreparationConflictError extends Error {}

export function createSessionService({ repository, tokenService, preparationVerifier, now = () => new Date() }) {
  return {
    async create(input) {
      const session = {
        id: randomUUID(),
        livenessChallengeId: randomUUID(),
        moodleUserId: input.moodleUserId,
        moodleCourseId: input.moodleCourseId,
        moodleQuizId: input.moodleQuizId,
        moodleAttemptId: input.moodleAttemptId,
        deviceMode: input.deviceMode,
        status: 'created',
        issuedAt: input.issuedAt,
        expiresAt: input.expiresAt,
        createdAt: now().toISOString()
      };
      const persistedSession = await repository.create(session);
      const { livenessChallengeId, livenessChallengeCompletedAt, ...publicSession } = persistedSession;

      return {
        session: publicSession,
        browserToken: tokenService.issueBrowserToken(persistedSession),
        preparation: { livenessChallengeId }
      };
    },
    async submitPreparation(sessionId, browserToken, evidence) {
      const claims = tokenService.verifyBrowserToken(browserToken);
      if (claims.sessionId !== sessionId) {
        throw new Error('Browser token is not valid for this session');
      }
      const session = await repository.findById(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      if (session.status !== 'created') {
        throw new PreparationConflictError('Preparation can only be submitted for a created session');
      }
      const parsedEvidence = parsePreparationSubmission(evidence);
      const submissionId = randomUUID();
      const saved = await repository.savePreparation({
        sessionId,
        id: submissionId,
        evidence: parsedEvidence,
        submittedAt: now().toISOString()
      });
      if (!saved) {
        throw new PreparationConflictError('Preparation evidence has already been submitted');
      }
      return { status: 'submitted', submissionId };
    },
    async recordTrustedPreparation(sessionId, verification) {
      const session = await repository.findById(sessionId);
      if (!session || session.status !== 'created') {
        throw new PreparationConflictError('Preparation verification is no longer accepted');
      }
      const submission = await repository.findPreparation(sessionId);
      if (!submission) {
        throw new PreparationConflictError('Preparation evidence was not found');
      }
      const parsedVerification = parseTrustedPreparationVerification(verification);
      if (parsedVerification.submissionId !== submission.id) {
        throw new PreparationConflictError('Preparation verification does not match the submitted evidence');
      }
      const saved = await repository.saveTrustedPreparation({
        sessionId,
        ...parsedVerification,
        verifiedAt: now().toISOString()
      });
      if (!saved) {
        throw new PreparationConflictError('Preparation verification has already been recorded');
      }
      return { status: 'verified' };
    },
    async verifyPreparation(sessionId) {
      const session = await repository.findById(sessionId);
      const submission = await repository.findPreparation(sessionId);
      if (!session || !submission || !preparationVerifier) {
        return { ready: false, errors: ['preparation submission was not found'] };
      }
      if (session.status === 'ready') {
        return { ready: true };
      }
      if (session.status !== 'created') {
        return { ready: false, errors: ['session is not eligible for preparation readiness'] };
      }

      const trustedPreparation = await repository.findTrustedPreparation(sessionId);

      const result = await preparationVerifier.verify(submission, trustedPreparation, session);
      if (!result.valid) {
        return { ready: false, errors: result.errors };
      }

      const markedReady = await repository.markPreparationReady({
        sessionId,
        challengeId: submission.evidence.liveness.challengeId,
        completedAt: now().toISOString()
      });
      if (!markedReady) {
        return { ready: false, errors: ['session is no longer eligible for preparation readiness'] };
      }
      return { ready: true };
    },
    async getReadiness(sessionId) {
      const session = await repository.findById(sessionId);
      if (!session) {
        return null;
      }
      return { ready: session.status === 'ready' };
    }
  };
}
