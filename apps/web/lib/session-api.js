const apiUrl = process.env.NEXT_PUBLIC_PROCTORING_API_URL;

export function readSessionId(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).sessionId;
  } catch {
    throw new Error('invalid_session_token');
  }
}

async function request(path, token, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (!response.ok) {
    throw new Error(`api_${response.status}`);
  }
  return response.json();
}

export function getSession(token) {
  const sessionId = readSessionId(token);
  return request(`/v1/sessions/${sessionId}`, token);
}

export function activateSession(token, preparation) {
  const sessionId = readSessionId(token);
  return request(`/v1/sessions/${sessionId}/activate`, token, {
    body: JSON.stringify(preparation),
    method: 'POST'
  });
}

export function sendSessionEvent(token, event) {
  const sessionId = readSessionId(token);
  return request(`/v1/sessions/${sessionId}/events`, token, {
    body: JSON.stringify(event),
    method: 'POST'
  });
}

export function sendEvidence(token, kind, capture) {
  const sessionId = readSessionId(token);
  return request(`/v1/sessions/${sessionId}/evidence`, token, {
    body: JSON.stringify({ capture, kind }),
    method: 'POST'
  });
}
