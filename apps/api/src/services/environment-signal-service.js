export function createEnvironmentSignalService({ eventService, featureEnabled = false }) {
  return {
    async record(sessionId, signal) {
      if (!featureEnabled || !signal || !Number.isFinite(signal.confidence)) {
        return null;
      }
      const metadata = normalizeEnvironmentSignal(signal);
      return eventService.record(sessionId, {
        clientEventId: signal.clientEventId,
        occurredAt: signal.occurredAt,
        type: 'environment_intrusion',
        metadata
      });
    }
  };
}

function normalizeEnvironmentSignal(signal) {
  return {
    box: {
      height: roundBox(signal.box?.height),
      width: roundBox(signal.box?.width),
      x: roundBox(signal.box?.x),
      y: roundBox(signal.box?.y)
    },
    confidence: Math.round(signal.confidence * 100) / 100,
    modelVersion: signal.modelVersion,
    objectCount: Math.max(1, Math.min(255, Math.trunc(signal.objectCount ?? 1))),
    objectType: String(signal.objectType).slice(0, 64)
  };
}

function roundBox(value) {
  return Math.round(Math.min(1, Math.max(0, Number(value) || 0)) * 10000) / 10000;
}
