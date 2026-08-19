import { CreateSessionInput } from '@proctoring/contracts';

export function createSessionService(repository) {
  return {
    async create(input) {
      return repository.create(CreateSessionInput.parse(input));
    },
    async getActive(id) {
      const session = await repository.findById(id);
      if (!session || !['pending', 'active'].includes(session.status) || Date.parse(session.expiresAt) <= Date.now()) {
        return null;
      }
      return session;
    },
    async complete(id) {
      return repository.complete(id);
    },
    async activate(id) {
      return repository.activate(id);
    }
  };
}
