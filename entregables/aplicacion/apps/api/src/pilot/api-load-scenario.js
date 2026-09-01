import crypto from 'node:crypto';

export function createApiLoadOperation(options) {
  const apiUrl = options.apiUrl.replace(/\/$/, '');
  const request = createJsonRequester(options.fetchImplementation ?? fetch);

  return async function runApiScenario(fixture) {
    let bytes = 0;
    const created = await request(`${apiUrl}/v1/internal/sessions`, {
      headers: { 'X-Moodle-Integration-Key': options.integrationKey },
      payload: fixture
    });
    bytes += created.bytes;

    const sessionId = created.payload.session.id;
    const issuedToken = await request(`${apiUrl}/v1/internal/sessions/${sessionId}/browser-token`, {
      headers: { 'X-Moodle-Integration-Key': options.integrationKey },
      payload: {}
    });
    bytes += issuedToken.bytes;

    const browserHeaders = { Authorization: `Bearer ${issuedToken.payload.browserToken}` };
    const activated = await request(`${apiUrl}/v1/sessions/${sessionId}/activate`, {
      headers: browserHeaders,
      payload: {
        identityPassed: true,
        livenessChallenge: ['blink', 'turn-left'],
        livenessPassed: true,
        referenceCapture: options.referenceCapture
      }
    });
    bytes += activated.bytes;

    const event = await request(`${apiUrl}/v1/sessions/${sessionId}/events`, {
      headers: browserHeaders,
      payload: {
        clientEventId: deterministicUuid(fixture.moodleAttemptId),
        metadata: { source: 'pilot-load' },
        occurredAt: new Date().toISOString(),
        type: 'camera_interrupted'
      }
    });
    bytes += event.bytes;

    return { bytes, statusCode: event.statusCode };
  };
}

function createJsonRequester(fetchImplementation) {
  return async function request(url, options) {
    const body = JSON.stringify(options.payload);
    const response = await fetchImplementation(url, {
      body,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      method: 'POST'
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`api_${response.status}`);
    }
    return {
      bytes: Buffer.byteLength(body) + Buffer.byteLength(text),
      payload: JSON.parse(text),
      statusCode: response.status
    };
  };
}

function deterministicUuid(value) {
  const bytes = crypto.createHash('sha256').update(String(value)).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
