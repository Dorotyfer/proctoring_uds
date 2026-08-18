import { randomUUID } from 'node:crypto';

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
      await repository.savePreparation({
        sessionId,
        evidence,
        submittedAt: now().toISOString()
      });
      return { status: 'submitted' };
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

      const result = await preparationVerifier.verify(submission, session);
      if (!result.valid) {
        return { ready: false, errors: result.errors };
      }

      const consumed = await repository.consumeLivenessChallenge({
        sessionId,
        challengeId: submission.evidence.liveness.challengeId,
        completedAt: now().toISOString()
      });
      if (!consumed) {
        return { ready: false, errors: ['liveness challenge was already completed'] };
      }

      await repository.setStatus(sessionId, 'ready');
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
