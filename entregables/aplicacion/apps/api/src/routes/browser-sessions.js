import { z } from 'zod';

const ActivationInput = z.object({
  identityPassed: z.literal(true),
  livenessPassed: z.literal(true),
  livenessChallenge: z.array(z.enum(['blink', 'turn-left', 'turn-right'])).length(2),
  referenceCapture: z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/)
}).refine((input) => new Set(input.livenessChallenge).size === 2, {
  message: 'Liveness challenge steps must be unique'
});

const EvidenceInput = z.object({
  kind: z.enum(['interval', 'alert']),
  capture: z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/)
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
    const parsed = ActivationInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Identity and liveness checks are required' });
    }

    const referenceCapture = Buffer.from(parsed.data.referenceCapture.split(',')[1], 'base64');
    if (referenceCapture.length === 0 || referenceCapture.length > 200 * 1024) {
      return reply.code(400).send({ error: 'Reference capture must not exceed 200 KB' });
    }

    const session = await options.sessionService.activate(sessionId, {
      livenessChallenge: parsed.data.livenessChallenge,
      referenceCapture
    });
    if (!session) {
      return reply.code(409).send({ error: 'Session cannot be activated' });
    }

    return { session: { id: session.id, status: session.status } };
  });

  app.post('/v1/sessions/:sessionId/evidence', async (request, reply) => {
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
    const parsed = EvidenceInput.safeParse(request.body);
    if (!session || session.status !== 'active' || !parsed.success) {
      return reply.code(409).send({ error: 'Evidence cannot be stored for this session' });
    }
    const capture = Buffer.from(parsed.data.capture.split(',')[1], 'base64');
    if (capture.length === 0 || capture.length > 200 * 1024) {
      return reply.code(400).send({ error: 'Evidence capture must not exceed 200 KB' });
    }
    const evidence = await options.evidenceService.storeCapture(sessionId, parsed.data.kind, capture);
    return reply.code(201).send({ evidence: { id: evidence.id, kind: evidence.kind } });
  });
}
