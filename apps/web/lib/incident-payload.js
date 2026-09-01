export function createIncident(type, capture, metadata = {}) {
  return {
    capture,
    clientEventId: crypto.randomUUID(),
    metadata: {
      ...metadata,
      captureStatus: capture ? 'available' : 'unavailable'
    },
    occurredAt: new Date().toISOString(),
    type
  };
}
