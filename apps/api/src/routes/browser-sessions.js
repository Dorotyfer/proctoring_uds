import { z } from 'zod';

const ActivationInput = z.object({
  identityPassed: z.literal(true),
  livenessPassed: z.literal(true)
});

function authorizeBrowserSession(request, reply) {
  const parsedId = z.string().uuid().safeParse(request.params.sessionId);
  if (!parsedId.success) {
    reply.code(400).send({ error: 'Invalid session identifier' });
    return null;
  }
  if (request.user.aud !== 'proctoring-browser' || request.user.sessionId !== parsedId.data) {
    reply.code(403).send({ error: 'Token does not belong to this session' });
    return null;
  }
  return parsedId.data;
}

export async function registerBrowserSessionRoutes(app, options) {
  app.get('/v1/sessions/:sessionId', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired browser token' });
    }

    const sessionId = authorizeBrowserSession(request, reply);
    if (!sessionId) {
      return reply;
    }
    const session = await options.sessionService.getActive(sessionId);
    if (!session) {
      return reply.code(404).send({ error: 'Active session not found' });
    }

    return {
      session: {
        id: session.id,
        deviceMode: session.deviceMode,
        status: session.status,
        expiresAt: session.expiresAt
      }
    };
  });

  app.post('/v1/sessions/:sessionId/activate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired browser token' });
    }

    const sessionId = authorizeBrowserSession(request, reply);
    if (!sessionId) {
      return reply;
    }
    if (!ActivationInput.safeParse(request.body).success) {
      return reply.code(400).send({ error: 'Identity and liveness checks are required' });
    }

    const session = await options.sessionService.activate(sessionId);
    if (!session) {
      return reply.code(409).send({ error: 'Session cannot be activated' });
    }

    return { session: { id: session.id, status: session.status } };
  });
}
