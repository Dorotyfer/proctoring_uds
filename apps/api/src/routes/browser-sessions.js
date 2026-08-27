import { z } from 'zod';

import {
  BiometricConsentRequiredError,
  BiometricUnavailableError
} from '../services/biometric-profile-service.js';
import {
  IdentityDocumentRequiredError,
  IdentityDocumentUnavailableError
} from '../services/session-service.js';
import { isJpegBuffer } from '../services/image-validation.js';

const ActivationInput = z.object({
  identityPassed: z.literal(true),
  livenessPassed: z.literal(true),
  livenessChallenge: z.array(z.enum(['blink', 'turn-left', 'turn-right'])).length(2),
  referenceCapture: z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/),
  biometricConsentAccepted: z.boolean().optional(),
  biometricSamples: z.array(z.array(z.number().finite())).length(3).optional(),
  documentCapture: z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/).optional()
}).refine((input) => new Set(input.livenessChallenge).size === 2, {
  message: 'Liveness challenge steps must be unique'
});

const EvidenceInput = z.object({
  kind: z.enum(['interval', 'alert']),
  capture: z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/)
});

export function authorizeBrowserSession(request, reply) {
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

    const biometric = options.biometricService
      ? await options.biometricService.getStatus(session.moodleUserId)
      : { enrollmentVersion: null, state: 'unregistered' };
    return {
      session: {
        biometric,
        id: session.id,
        deviceMode: session.deviceMode,
        status: session.status,
        expiresAt: session.expiresAt,
        identityDocumentRequired: Boolean(options.biometricService) &&
          ['unregistered', 'revoked'].includes(biometric.state) &&
          !session.identityDocumentEvidenceId
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
    if (options.requireHttps && !isHttpsRequest(request)) {
      return reply.code(400).send({ error: 'Biometric activation requires HTTPS' });
    }
    const parsed = ActivationInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Identity and liveness checks are required' });
    }

    const referenceCapture = Buffer.from(parsed.data.referenceCapture.split(',')[1], 'base64');
    if (!isJpegBuffer(referenceCapture) || referenceCapture.length > 200 * 1024) {
      return reply.code(400).send({ error: 'Reference capture must be a JPEG not exceeding 200 KB' });
    }
    const documentCapture = parsed.data.documentCapture
      ? Buffer.from(parsed.data.documentCapture.split(',')[1], 'base64')
      : null;
    if (documentCapture && (!isJpegBuffer(documentCapture) || documentCapture.length > 200 * 1024)) {
      return reply.code(400).send({ error: 'Identity document capture must be a JPEG not exceeding 200 KB' });
    }

    let activation;
    try {
      activation = await options.sessionService.activate(sessionId, {
        biometricConsentAccepted: parsed.data.biometricConsentAccepted,
        biometricSamples: parsed.data.biometricSamples,
        documentCapture,
        livenessChallenge: parsed.data.livenessChallenge,
        referenceCapture
      });
    } catch (error) {
      if (error instanceof BiometricConsentRequiredError) {
        return reply.code(409).send({ code: 'biometric_consent_required', error: error.message });
      }
      if (error instanceof BiometricUnavailableError) {
        return reply.code(503).send({ error: 'Biometric verification is temporarily unavailable' });
      }
      if (error instanceof IdentityDocumentRequiredError) {
        return reply.code(409).send({ code: 'identity_document_required', error: error.message });
      }
      if (error instanceof IdentityDocumentUnavailableError) {
        return reply.code(503).send({ error: 'Identity document storage is temporarily unavailable' });
      }
      if (error instanceof TypeError) {
        return reply.code(400).send({ error: 'Invalid biometric samples' });
      }
      throw error;
    }

    const session = activation?.session ?? activation;
    if (!session) {
      return reply.code(409).send({ error: 'Session cannot be activated' });
    }

    let biometric = activation?.biometric ?? null;
    if (biometric?.status === 'mismatch') {
      if (!options.incidentService) {
        return reply.code(503).send({ error: 'Biometric alert service is unavailable' });
      }
      try {
        const incident = await options.incidentService.record(session.id, {
          capture: referenceCapture,
          clientEventId: session.id,
          metadata: {
            mismatchedSamples: biometric.mismatchedSamples,
            profileVersion: biometric.enrollmentVersion,
            similarity: biometric.similarity,
            source: 'biometric_verification',
            threshold: biometric.threshold
          },
          occurredAt: new Date().toISOString(),
          type: 'biometric_mismatch'
        });
        biometric = { ...biometric, alertId: incident.alert?.id ?? null };
      } catch {
        return reply.code(503).send({ error: 'Biometric alert storage is temporarily unavailable' });
      }
    }

    return {
      biometric: biometric
        ? { alertId: biometric.alertId ?? null, status: biometric.status }
        : undefined,
      session: { id: session.id, status: session.status }
    };
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
    if (!isJpegBuffer(capture) || capture.length > 200 * 1024) {
      return reply.code(400).send({ error: 'Evidence capture must be a JPEG not exceeding 200 KB' });
    }
    const evidence = await options.evidenceService.storeCapture(sessionId, parsed.data.kind, capture);
    return reply.code(201).send({ evidence: { id: evidence.id, kind: evidence.kind } });
  });
}

function isHttpsRequest(request) {
  const forwardedProtocol = request.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProtocol === 'string'
    ? forwardedProtocol.split(',')[0].trim()
    : request.protocol;
  return protocol === 'https';
}
