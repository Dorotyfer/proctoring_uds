import { createHmac, timingSafeEqual } from 'node:crypto';

import { BrowserClaims } from '@proctoring/contracts';

const browserTokenLifetimeMilliseconds = 15 * 60 * 1000;

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function parseToken(token, secret) {
  if (typeof token !== 'string') {
    throw new Error('Invalid browser token');
  }

  const [header, payload, signature] = token.split('.');

  if (!header || !payload || !signature) {
    throw new Error('Invalid browser token');
  }

  const expectedSignature = sign(`${header}.${payload}`, secret);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    throw new Error('Invalid browser token');
  }

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid browser token');
  }
}

function toBrowserClaims(payload) {
  if (!Number.isInteger(payload.exp)) {
    throw new Error('Invalid browser token');
  }

  const parsedClaims = BrowserClaims.safeParse({
    sessionId: payload.sessionId,
    moodleAttemptId: payload.moodleAttemptId,
    deviceMode: payload.deviceMode,
    aud: payload.aud,
    expiresAt: new Date(payload.exp * 1000).toISOString()
  });

  if (!parsedClaims.success) {
    throw new Error('Invalid browser token');
  }

  return parsedClaims.data;
}

export function createTokenService({ secret, now = () => new Date() }) {
  if (!secret) {
    throw new Error('A browser token secret is required');
  }

  return {
    issueBrowserToken(session) {
      const expiration = new Date(now().getTime() + browserTokenLifetimeMilliseconds);
      const payload = {
        sessionId: session.id,
        moodleAttemptId: session.moodleAttemptId,
        deviceMode: session.deviceMode,
        aud: 'proctoring-browser',
        exp: Math.floor(expiration.getTime() / 1000)
      };
      const header = { alg: 'HS256', typ: 'JWT' };
      const signingInput = `${encode(header)}.${encode(payload)}`;

      return `${signingInput}.${sign(signingInput, secret)}`;
    }
  };
}

export function verifyBrowserToken(token, secret, { now = new Date() } = {}) {
  const payload = parseToken(token, secret);

  if (now.getTime() >= payload.exp * 1000) {
    throw new Error('Browser token has expired');
  }

  return toBrowserClaims(payload);
}
