import Fastify from 'fastify';

import { createApiConfig } from './config.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { createPreparationVerifier } from './services/preparation-verifier.js';
import { createSessionService } from './services/session-service.js';
import { createTokenService } from './services/token-service.js';
import { createPreparationWorker } from './workers/preparation-worker.js';

export function createApp({ environment = process.env, repository, tokenSecret, now }) {
  const { integrationKey, preparationWorkerKey } = createApiConfig(environment);

  const app = Fastify();
  const tokenService = createTokenService({ secret: tokenSecret, now });
  const preparationVerifier = createPreparationVerifier();
  const sessionService = createSessionService({ repository, tokenService, preparationVerifier, now });
  const preparationWorker = createPreparationWorker({ sessionService });

  registerSessionRoutes(app, { integrationKey, preparationWorkerKey, preparationWorker, sessionService });

  return app;
}
