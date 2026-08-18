import { randomUUID } from 'node:crypto';

export function createSessionService({ repository, tokenService, now = () => new Date() }) {
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
    async markReady(sessionId, browserToken) {
      const claims = tokenService.verifyBrowserToken(browserToken);
      if (claims.sessionId !== sessionId) {
        throw new Error('Browser token is not valid for this session');
      }
      const session = await repository.findById(sessionId);
      if (!session) {
        throw new Error('Session not found');
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
