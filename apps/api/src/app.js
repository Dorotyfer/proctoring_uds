import fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';

import { registerBrowserSessionRoutes } from './routes/browser-sessions.js';
import { registerEventRoutes } from './routes/events.js';
import { registerSessionRoutes } from './routes/sessions.js';

export async function buildApp(options) {
  const app = fastify({
    bodyLimit: 256 * 1024,
    logger: options.logger ?? true,
    requestIdHeader: 'x-correlation-id'
  });
  await app.register(fastifyJwt, { secret: options.jwtSecret });

  app.get('/health', async (request, reply) => {
    try {
      await options.healthService.check();
      return { status: 'ok', database: 'available' };
    } catch {
      return reply.code(503).send({ status: 'degraded', database: 'unavailable' });
    }
  });
  await app.register(registerSessionRoutes, {
    moodleIntegrationKey: options.moodleIntegrationKey,
    sessionService: options.sessionService
  });
  await app.register(registerEventRoutes, {
    eventService: options.eventService
  });
  await app.register(registerBrowserSessionRoutes, {
    sessionService: options.sessionService
  });

  return app;
}
