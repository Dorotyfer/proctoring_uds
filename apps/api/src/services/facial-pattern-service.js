const CATEGORIES = new Set(['neutral', 'positive', 'negative', 'uncertain']);

export function createFacialPatternService({ eventService, featureEnabled = false }) {
  return {
    async record(sessionId, signal, policyVersion = 'quiz-policy-3') {
      if (!featureEnabled || !signal || !CATEGORIES.has(signal.category)) {
        return null;
      }
      if (!Number.isFinite(signal.confidence) || signal.confidence < 0.6) {
        return null;
      }
      return eventService.record(sessionId, {
        clientEventId: signal.clientEventId,
        occurredAt: signal.occurredAt,
        type: 'facial_pattern_detected',
        metadata: {
          category: signal.category,
          confidence: Math.round(signal.confidence * 100) / 100,
          modelVersion: signal.modelVersion,
          policyVersion
        }
      });
    }
  };
}
