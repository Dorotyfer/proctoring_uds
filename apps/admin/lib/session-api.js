export async function submitPreparation({ apiUrl, sessionId, browserToken, evidence }) {
  const response = await fetch(
    `${apiUrl.replace(/\/$/, '')}/v1/sessions/${encodeURIComponent(sessionId)}/preparation`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${browserToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(evidence)
    }
  );

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || 'Preparation submission failed');
  }
  return body;
}
