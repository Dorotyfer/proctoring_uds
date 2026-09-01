const WINDOW_MS = 5 * 60 * 1000;

export const DEFAULT_RISK_WEIGHTS = Object.freeze({
  biometric_mismatch: 40,
  biometric_monitor_mismatch: 40,
  multiple_faces: 30,
  camera_interrupted: 25,
  environment_intrusion: 20,
  facial_pattern_detected: 10,
  page_visibility_changed: 10,
  network_disconnected: 5,
  seb_event: 15
});

export function calculateRiskScore(events, now = Date.now(), policy = {}) {
  const weights = { ...DEFAULT_RISK_WEIGHTS, ...(policy.weights ?? {}) };
  const seen = new Set();
  const factors = new Map();

  for (const event of events ?? []) {
    const eventKey = event.id ?? event.clientEventId;
    if (eventKey && seen.has(eventKey)) continue;
    if (eventKey) seen.add(eventKey);
    const occurredAt = Date.parse(event.occurredAt ?? event.occurred_at ?? '');
    const age = now - occurredAt;
    const weight = weights[event.type];
    if (!Number.isFinite(occurredAt) || age < 0 || age > WINDOW_MS || !weight) continue;
    const decay = 1 - age / WINDOW_MS;
    const factor = factors.get(event.type) ?? { type: event.type, weight, count: 0, contribution: 0 };
    factor.count += 1;
    factor.contribution += Math.round(weight * decay);
    factors.set(event.type, factor);
  }

  const orderedFactors = [...factors.values()]
    .map((factor) => ({ ...factor, contribution: Math.min(factor.contribution, factor.weight * factor.count) }))
    .sort((left, right) => right.contribution - left.contribution || left.type.localeCompare(right.type));
  const score = Math.min(100, orderedFactors.reduce((total, factor) => total + factor.contribution, 0));

  return {
    calculatedAt: new Date(now).toISOString(),
    category: score >= 75 ? 'high_risk' : score >= 50 ? 'medium_risk' : score >= 20 ? 'observation' : 'normal',
    factors: orderedFactors,
    policyVersion: policy.version ?? 'risk-v1',
    score
  };
}
