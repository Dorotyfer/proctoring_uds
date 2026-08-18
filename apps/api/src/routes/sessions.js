import { createHash, timingSafeEqual } from 'node:crypto';

import { CreateSessionInput } from '@proctoring/contracts';

function isAuthorized(providedKey, integrationKey) {
  const providedDigest = createHash('sha256')
    .update(String(providedKey ?? ''))
    .digest();
  const expectedDigest = createHash('sha256')
    .update(String(integrationKey ?? ''))
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
}
