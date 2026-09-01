import { z, ZodError } from 'zod';

import { EventRateLimitError } from '../repositories/event-repository.js';
import { EventTimestampError, SessionUnavailableError } from '../services/event-service.js';

export async function registerEventRoutes(app, options) {
  app.post('/v1/sessions/:sessionId/events', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired browser token' });
    }

    const parsedId = z.string().uuid().safeParse(request.params.sessionId);
    if (!parsedId.success) {
      return reply.code(400).send({ error: 'Invalid session identifier' });
    }
    if (request.user.aud !== 'proctoring-browser' || request.user.sessionId !== parsedId.data) {
      return reply.code(403).send({ error: 'Token does not belong to this session' });
    }

    try {
      const result = await options.eventService.record(parsedId.data, request.body);
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof ZodError || error instanceof EventTimestampError) {
        return reply.code(400).send({ error: 'Invalid event payload' });
      }
      if (error instanceof SessionUnavailableError) {
        return reply.code(409).send({ error: 'Session is not active' });
      }
      if (error instanceof EventRateLimitError) {
        return reply.code(429).send({ error: 'Event rate limit exceeded' });
      }
      throw error;
    }
  });
}
