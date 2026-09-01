export async function deliverIncident({ buffer, incident, sendIncident, sendSessionEvent, sessionId }) {
  try {
    await buffer.enqueue(incident);
  } catch {
    try {
      await sendIncident(incident);
      return 'sent_directly';
    } catch {
      await sendSessionEvent(sessionId, {
        clientEventId: incident.clientEventId,
        metadata: { ...incident.metadata, captureQueue: 'unavailable' },
        occurredAt: incident.occurredAt,
        type: incident.type
      }).catch(() => {});
      return 'event_fallback';
    }
  }

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    await buffer.flush();
  }
  return 'queued';
}
