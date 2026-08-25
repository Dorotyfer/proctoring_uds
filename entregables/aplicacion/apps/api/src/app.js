import fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';

import { registerBrowserSessionRoutes } from './routes/browser-sessions.js';
import { registerEventRoutes } from './routes/events.js';
import { registerIncidentRoutes } from './routes/incidents.js';
import { registerPanelRoutes } from './routes/panel.js';
import { registerSessionRoutes } from './routes/sessions.js';

export async function buildApp(options) {
  const app = fastify({
    bodyLimit: 384 * 1024,
    logger: options.logger ?? true,
    requestIdHeader: 'x-correlation-id'
  });
  await app.register(fastifyCors, {
    allowedHeaders: ['Authorization', 'Content-Type'],
    methods: ['GET', 'POST'],
    credentials: true,
    origin: options.webOrigin ?? false
  });
  await app.register(fastifyCookie);
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
    biometricService: options.biometricService,
    evidenceService: options.evidenceService,
    incidentService: options.incidentService,
    requireHttps: options.requireHttps ?? false,
    sessionService: options.sessionService
  });
  if (options.incidentService) {
    await app.register(registerIncidentRoutes, { incidentService: options.incidentService });
  }
  if (options.panel) {
    await app.register(registerPanelRoutes, options.panel);
  }

  return app;
}
