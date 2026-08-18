import Fastify from 'fastify';

import { registerSessionRoutes } from './routes/sessions.js';
import { createPreparationVerifier } from './services/preparation-verifier.js';
import { createSessionService } from './services/session-service.js';
import { createTokenService } from './services/token-service.js';
import { createPreparationWorker } from './workers/preparation-worker.js';

export function createApp({ integrationKey, preparationWorkerKey, repository, tokenSecret, now }) {
  if (
    typeof integrationKey === 'string' &&
    integrationKey.length > 0 &&
    integrationKey === preparationWorkerKey
  ) {
    throw new Error('Moodle and worker integration keys must be distinct');
  }

  const app = Fastify();
  const tokenService = createTokenService({ secret: tokenSecret, now });
  const preparationVerifier = createPreparationVerifier();
  const sessionService = createSessionService({ repository, tokenService, preparationVerifier, now });
  const preparationWorker = createPreparationWorker({ sessionService });

  registerSessionRoutes(app, { integrationKey, preparationWorkerKey, preparationWorker, sessionService });

  return app;
}
