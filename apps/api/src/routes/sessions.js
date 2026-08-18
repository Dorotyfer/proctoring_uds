import { createHash, timingSafeEqual } from 'node:crypto';

import { CreateSessionInput } from '@proctoring/contracts';

function isAuthorized(providedKey, integrationKey) {
  if (
    typeof providedKey !== 'string' ||
    providedKey.length === 0 ||
    typeof integrationKey !== 'string' ||
    integrationKey.length === 0
  ) {
    return false;
  }

  const providedDigest = createHash('sha256')
    .update(providedKey)
    .digest();
  const expectedDigest = createHash('sha256')
    .update(integrationKey)
    .digest();

  return timingSafeEqual(providedDigest, expectedDigest);
}

export function registerSessionRoutes(app, { integrationKey, sessionService }) {
  app.post('/v1/internal/sessions', async (request, reply) => {
    if (!isAuthorized(request.headers['x-moodle-integration-key'], integrationKey)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const parsedInput = CreateSessionInput.safeParse(request.body);

    if (!parsedInput.success) {
      return reply.code(400).send({ error: 'Invalid session payload' });
    }

    const result = await sessionService.create(parsedInput.data);

    return reply.code(201).send(result);
  });

  app.post('/v1/sessions/:sessionId/ready', async (request, reply) => {
    const authorization = request.headers.authorization;
    const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : null;
    try {
      const result = await sessionService.markReady(request.params.sessionId, token);
      return reply.code(200).send(result);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  app.get('/v1/internal/sessions/:sessionId/readiness', async (request, reply) => {
    if (!isAuthorized(request.headers['x-moodle-integration-key'], integrationKey)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const readiness = await sessionService.getReadiness(request.params.sessionId);
    if (!readiness) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.code(200).send(readiness);
  });
}
