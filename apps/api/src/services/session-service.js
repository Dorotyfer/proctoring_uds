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
    }
  };
}
