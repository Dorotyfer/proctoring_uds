export function createPreparationWorker({ sessionService }) {
  return {
    async verify(sessionId) {
      return sessionService.verifyPreparation(sessionId);
    }
  };
}
