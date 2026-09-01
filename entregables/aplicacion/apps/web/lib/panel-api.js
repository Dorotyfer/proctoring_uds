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
    getSession: (sessionId) => request(`/v1/panel/sessions/${encodeURIComponent(sessionId)}`),
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

function queryString(values) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== '' && value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  });
  return query.toString();
}
