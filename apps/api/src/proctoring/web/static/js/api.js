export class ApiError extends Error {
  constructor(status, message, retryAfterSeconds = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function decodeOwnedSessionId(token) {
  try {
    const segment = token.split('.')[1];
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded));
    if (typeof payload.sessionId !== 'string' || !isCanonicalUuid(payload.sessionId)) {
      throw new Error('missing_session_id');
    }
    return payload.sessionId.toLowerCase();
  } catch {
    throw new Error('invalid_session_token');
  }
}

export function createSessionApi({ apiBaseUrl, token, sessionId }) {
  const base = apiBaseUrl.replace(/\/$/, '');

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${base}${path}`, {
        ...options,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          ...options.headers
        }
      });
    } catch {
      throw new ApiError(0, 'network_unavailable');
    }

    const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(response.status, payload?.error ?? `api_${response.status}`, retryAfter);
    }
    return payload;
  }

  return {
    getSession: () => request(`/v1/sessions/${sessionId}`),
    createChallenge: () => request(`/v1/sessions/${sessionId}/liveness-challenges`, { method: 'POST' }),
    submitPreparation(formData) {
      return request(`/v1/sessions/${sessionId}/preparation-analyses`, {
        method: 'POST',
        body: formData
      });
    },
    submitMonitoring(formData) {
      return request(`/v1/sessions/${sessionId}/monitoring-frames`, {
        method: 'POST',
        body: formData
      });
    },
    getAnalysis: (analysisId) => request(`/v1/sessions/${sessionId}/analyses/${analysisId}`),
    getMonitoringStatus: () => request(`/v1/sessions/${sessionId}/monitoring-status`),
    sendEvent: (event) => request(`/v1/sessions/${sessionId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    })
  };
}

export async function pollAnalysis(api, analysisId, { intervalMs = 1000, onUpdate = () => {} } = {}) {
  const terminal = new Set(['completed', 'failed', 'expired']);
  while (true) {
    const payload = await api.getAnalysis(analysisId);
    const analysis = payload.analysis;
    onUpdate(analysis);
    if (terminal.has(analysis.state)) {
      return analysis;
    }
    await wait(intervalMs);
  }
}

export function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number.parseInt(value, 10);
  return Number.isInteger(seconds) && seconds >= 0 ? seconds : null;
}

function isCanonicalUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
