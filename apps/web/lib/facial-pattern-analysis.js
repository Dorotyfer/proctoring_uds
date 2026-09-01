const CATEGORIES = new Set(['neutral', 'positive', 'negative', 'uncertain']);

export function normalizeFacialPattern({ expression, confidence, modelVersion }) {
  return {
    category: mapExpression(expression),
    confidence: Math.round(confidence * 100) / 100,
    modelVersion
  };
}

export function createFacialPatternTracker({
  confidenceThreshold = 0.60,
  persistenceMs = 30000,
  now = () => Date.now()
} = {}) {
  let candidate = null;
  let candidateSince = null;
  let emittedCategory = null;

  return {
    update(signal) {
      if (!signal || !Number.isFinite(signal.confidence) || signal.confidence < confidenceThreshold) {
        candidate = null;
        candidateSince = null;
        return null;
      }
      const normalized = normalizeFacialPattern(signal);
      const currentTime = now();
      if (candidate !== normalized.category) {
        candidate = normalized.category;
        candidateSince = currentTime;
        return null;
      }
      if (normalized.category === emittedCategory || currentTime - candidateSince < persistenceMs) {
        return null;
      }
      emittedCategory = normalized.category;
      return normalized;
    }
  };
}

function mapExpression(expression) {
  const name = String(expression ?? '').toLowerCase();
  if (name === 'neutral') return 'neutral';
  if (['happy', 'joy', 'surprise'].includes(name)) return 'positive';
  if (['sad', 'angry', 'disgust'].includes(name)) return 'negative';
  return CATEGORIES.has(name) ? name : 'uncertain';
}
