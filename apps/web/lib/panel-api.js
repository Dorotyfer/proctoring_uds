export function createPanelApi(apiUrl) {
  async function request(path, options = {}) {
    const response = await fetch(`${apiUrl}${path}`, {
      credentials: 'include',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    });
    if (!response.ok) {
      const error = new Error(`panel_api_${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }

  return {
    getProfile: () => request('/v1/panel/me'),
    listCourses: (filters) => request(`/v1/panel/courses?${queryString(filters)}`),
    listSessions: (courseId, filters) => request(
      `/v1/panel/courses/${encodeURIComponent(courseId)}/sessions?${queryString(filters)}`
    ),
    getSession: async (sessionId) => normalizeSessionPayload(
      await request(`/v1/panel/sessions/${encodeURIComponent(sessionId)}`)
    ),
    subscribeSession(sessionId, onUpdate) {
      let stopped = false;
      let source = null;
      let polling = null;

      const poll = async () => {
        if (stopped) return;
        try {
          const payload = normalizeSessionPayload(
            await request(`/v1/panel/sessions/${encodeURIComponent(sessionId)}`)
          );
          if (!stopped) onUpdate(payload.session);
        } catch {
          // The visible session remains available while the next retry is pending.
        }
      };
      const startPolling = () => {
        if (polling === null) {
          void poll();
          polling = window.setInterval(() => void poll(), 5000);
        }
      };

      if (typeof window !== 'undefined' && typeof window.EventSource === 'function') {
        source = new window.EventSource(
          `${apiUrl}/v1/panel/sessions/${encodeURIComponent(sessionId)}/stream`,
          { withCredentials: true }
        );
        source.addEventListener('session.updated', () => void poll());
        source.onerror = () => {
          source.close();
          startPolling();
        };
      } else {
        startPolling();
      }

      return () => {
        stopped = true;
        source?.close();
        if (polling !== null) window.clearInterval(polling);
      };
    },
    reportCsv: async (courseId, filters) => {
      const response = await fetch(
        `${apiUrl}/v1/panel/courses/${encodeURIComponent(courseId)}/report.csv?${queryString(filters)}`,
        { credentials: 'include' }
      );
      if (!response.ok) {
        const error = new Error(`panel_api_${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.text();
    },
    reviewAlert: (alertId, status, note) => request(`/v1/panel/alerts/${encodeURIComponent(alertId)}/review`, {
      method: 'POST',
      body: JSON.stringify({ status, note })
    }),
    resetBiometricProfile: (moodleUserId) => request(
      `/v1/panel/biometric-profiles/${encodeURIComponent(moodleUserId)}/reset`,
      { method: 'POST' }
    ),
    listBiometricProfiles: (filters) => request(`/v1/panel/biometric-profiles?${queryString(filters)}`),
    accessEvidence: (evidenceId) => request(`/v1/panel/evidence/${encodeURIComponent(evidenceId)}/access`, {
      method: 'POST'
    }),
    logout: () => request('/v1/panel/logout', { method: 'POST' })
  };
}

function normalizeSessionPayload(payload) {
  if (!payload || !payload.session || typeof payload.session !== 'object') {
    throw new Error('panel_api_invalid_session');
  }

  return {
    ...payload,
    session: {
      ...payload.session,
      alerts: Array.isArray(payload.session.alerts) ? payload.session.alerts : [],
      events: Array.isArray(payload.session.events) ? payload.session.events : [],
      evidence: Array.isArray(payload.session.evidence) ? payload.session.evidence : []
    }
  };
}

function queryString(values) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== '' && value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  });
  return query.toString();
}
