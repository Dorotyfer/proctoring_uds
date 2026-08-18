import Fastify from 'fastify';

import { registerSessionRoutes } from './routes/sessions.js';
import { createSessionService } from './services/session-service.js';
import { createTokenService } from './services/token-service.js';

export function createApp({ integrationKey, repository, tokenSecret, now }) {
  const app = Fastify();
  const tokenService = createTokenService({ secret: tokenSecret, now });
  const sessionService = createSessionService({ repository, tokenService, now });

  registerSessionRoutes(app, { integrationKey, sessionService });

  return app;
}
