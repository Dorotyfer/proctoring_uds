import { IncidentInput } from '@proctoring/contracts';

import { authorizeBrowserSession } from './browser-sessions.js';
import { isJpegBuffer } from '../services/image-validation.js';

export async function registerIncidentRoutes(app, options) {
  app.post('/v1/sessions/:sessionId/incidents', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired browser token' });
    }

    const sessionId = authorizeBrowserSession(request, reply);
    if (!sessionId) {
      return reply;
    }

    const parsed = IncidentInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid incident payload' });
    }

    let capture = null;
    if (parsed.data.capture) {
      capture = Buffer.from(parsed.data.capture.split(',')[1], 'base64');
      if (!isJpegBuffer(capture) || capture.length > 200 * 1024) {
        return reply.code(400).send({ error: 'Incident capture must be a JPEG not exceeding 200 KB' });
      }
    }

    const result = await options.incidentService.record(sessionId, {
      ...parsed.data,
      capture
    });
    return reply.code(201).send({
      incident: {
        alertId: result.alert?.id ?? null,
        evidenceId: result.evidence?.id ?? null,
        eventId: result.event.id,
        status: result.alert?.status ?? 'open'
      }
    });
  });
}
