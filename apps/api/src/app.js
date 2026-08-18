import Fastify from 'fastify';

import { registerSessionRoutes } from './routes/sessions.js';
import { createSessionService } from './services/session-service.js';
import { createTokenService } from './services/token-service.js';

export function createApp({ integrationKey, preparationVerifier, preparationWorkerKey, repository, tokenSecret, now }) {
  const app = Fastify();
  const tokenService = createTokenService({ secret: tokenSecret, now });
  const sessionService = createSessionService({ repository, tokenService, preparationVerifier, now });

  registerSessionRoutes(app, { integrationKey, preparationWorkerKey, sessionService });

  return app;
}
