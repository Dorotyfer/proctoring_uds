import { CreateSessionInput } from '@proctoring/contracts';

export function createSessionService(repository, evidenceService) {
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
    async get(id) {
      return repository.findById(id);
    },
    async complete(id) {
      return repository.complete(id);
    },
    async activate(id, preparation) {
      const current = await repository.findById(id);
      if (!current || !['pending', 'active'].includes(current.status) || Date.parse(current.expiresAt) <= Date.now()) {
        return null;
      }
      const evidence = await evidenceService.storeIdentity(id, preparation.referenceCapture);
      const session = await repository.activate(id, {
        evidenceId: evidence.id,
        livenessChallenge: preparation.livenessChallenge
      });
      return session;
    }
  };
}
