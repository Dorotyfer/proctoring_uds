import { randomUUID } from 'node:crypto';

export function createSessionService({ repository, tokenService, preparationVerifier, now = () => new Date() }) {
  return {
    async create(input) {
      const session = {
        id: randomUUID(),
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

      return {
        session: persistedSession,
        browserToken: tokenService.issueBrowserToken(persistedSession)
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
        return { ready: false };
      }
      const verified = await preparationVerifier(submission, session);
      if (!verified) {
        return { ready: false };
      }
      await repository.setStatus(sessionId, 'active');
      return { ready: true };
    },
    async getReadiness(sessionId) {
      const session = await repository.findById(sessionId);
      if (!session) {
        return null;
      }
      return { ready: session.status === 'active' };
    }
  };
}
