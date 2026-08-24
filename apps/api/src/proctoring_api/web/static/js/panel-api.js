export class PanelApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'PanelApiError';
    this.status = status;
  }
}

export function createPanelApi(apiBaseUrl) {
  const base = apiBaseUrl.replace(/\/$/, '');
  let csrfToken = null;

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${base}${path}`, {
        ...options,
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers
        }
      });
    } catch {
      throw new PanelApiError(0, 'network_unavailable');
    }
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      throw new PanelApiError(response.status, payload?.error ?? `panel_api_${response.status}`);
    }
    return payload;
  }

  function mutate(path, options = {}) {
    if (!csrfToken) throw new PanelApiError(401, 'panel_not_initialized');
    return request(path, {
      ...options,
      method: 'POST',
      headers: {
        'X-CSRF-Token': csrfToken,
        ...options.headers
      }
    });
  }

  return {
    async initialize() {
      const payload = await request('/v1/panel/me');
      csrfToken = payload.csrfToken;
      return payload.user;
    },
    listCourses: (filters) => request(`/v1/panel/courses?${queryString(filters)}`),
    listSessions: (courseId, filters) => request(
      `/v1/panel/courses/${encodeURIComponent(courseId)}/sessions?${queryString(filters)}`
    ),
    getSession: (sessionId) => request(`/v1/panel/sessions/${encodeURIComponent(sessionId)}`),
    reviewAlert: (alertId, status, note) => mutate(`/v1/panel/alerts/${encodeURIComponent(alertId)}/review`, {
      body: JSON.stringify({ status, note })
    }),
    accessEvidence: (evidenceId) => mutate(`/v1/panel/evidence/${encodeURIComponent(evidenceId)}/access`),
    resetBiometricProfile: (moodleUserId) => mutate(
      `/v1/panel/biometric-profiles/${encodeURIComponent(moodleUserId)}/reset`
    ),
    logout: () => mutate('/v1/panel/logout'),
    clearSecrets() {
      csrfToken = null;
    }
  };
}

function queryString(values) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== '' && value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  }
  return query.toString();
}
