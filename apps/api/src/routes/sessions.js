import crypto from 'node:crypto';
import { z, ZodError } from 'zod';

function hasValidIntegrationKey(received, expected) {
  if (typeof received !== 'string') {
    return false;
  }

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function registerSessionRoutes(app, options) {
  app.post('/v1/internal/sessions', async (request, reply) => {
    if (!hasValidIntegrationKey(request.headers['x-moodle-integration-key'], options.moodleIntegrationKey)) {
      return reply.code(401).send({ error: 'Unauthorized Moodle integration request' });
    }

    try {
      const session = await options.sessionService.create(request.body);
      return reply.code(201).send({ session });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: 'Invalid session payload', details: error.issues });
      }
      throw error;
    }
  });

  app.post('/v1/internal/sessions/:sessionId/browser-token', async (request, reply) => {
    if (!hasValidIntegrationKey(request.headers['x-moodle-integration-key'], options.moodleIntegrationKey)) {
      return reply.code(401).send({ error: 'Unauthorized Moodle integration request' });
    }

    const parsedId = z.string().uuid().safeParse(request.params.sessionId);
    if (!parsedId.success) {
      return reply.code(400).send({ error: 'Invalid session identifier' });
    }

    const session = await options.sessionService.getActive(parsedId.data);
    if (!session) {
      return reply.code(404).send({ error: 'Active session not found' });
    }

    return {
      browserToken: app.jwt.sign({
        sessionId: session.id,
        moodleAttemptId: session.moodleAttemptId,
        deviceMode: session.deviceMode,
        deviceModePolicy: session.deviceModePolicy,
        policyVersion: session.policyVersion,
        aud: 'proctoring-browser'
      }, { expiresIn: '15m' })
    };
  });

  app.post('/v1/internal/sessions/:sessionId/status', async (request, reply) => {
    if (!hasValidIntegrationKey(request.headers['x-moodle-integration-key'], options.moodleIntegrationKey)) {
      return reply.code(401).send({ error: 'Unauthorized Moodle integration request' });
    }

    const parsedId = z.string().uuid().safeParse(request.params.sessionId);
    if (!parsedId.success) {
      return reply.code(400).send({ error: 'Invalid session identifier' });
    }

    const session = await options.sessionService.get(parsedId.data);
    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    return { session: { id: session.id, status: session.status } };
  });

  app.post('/v1/internal/sessions/:sessionId/complete', async (request, reply) => {
    if (!hasValidIntegrationKey(request.headers['x-moodle-integration-key'], options.moodleIntegrationKey)) {
      return reply.code(401).send({ error: 'Unauthorized Moodle integration request' });
    }

    const parsedId = z.string().uuid().safeParse(request.params.sessionId);
    if (!parsedId.success) {
      return reply.code(400).send({ error: 'Invalid session identifier' });
    }

    const session = await options.sessionService.complete(parsedId.data);
    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    return { session };
  });
}
