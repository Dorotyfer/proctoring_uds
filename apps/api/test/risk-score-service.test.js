import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateRiskScore } from '../src/services/risk-score-service.js';

const now = Date.parse('2026-08-28T12:00:00.000Z');

test('calculates a bounded explainable score from a five-minute window', () => {
  const result = calculateRiskScore([
    { id: 'event-1', occurredAt: new Date(now - 30_000).toISOString(), type: 'multiple_faces' },
    { id: 'event-2', occurredAt: new Date(now - 60_000).toISOString(), type: 'network_disconnected' }
  ], now);

  assert.equal(result.score, 31);
  assert.equal(result.category, 'observation');
  assert.deepEqual(result.factors, [
    { type: 'multiple_faces', weight: 30, count: 1, contribution: 27 },
    { type: 'network_disconnected', weight: 5, count: 1, contribution: 4 }
  ]);
});

test('ignores stale and duplicate events and caps the total at 100', () => {
  const event = { id: 'duplicate', occurredAt: new Date(now - 10_000).toISOString(), type: 'biometric_monitor_mismatch' };
  const result = calculateRiskScore([
    event,
    event,
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `face-${index}`,
      occurredAt: new Date(now - index * 1000).toISOString(),
      type: 'multiple_faces'
    })),
    { id: 'stale', occurredAt: new Date(now - 301_000).toISOString(), type: 'camera_interrupted' }
  ], now);

  assert.equal(result.score, 100);
  assert.equal(result.factors.find((factor) => factor.type === 'biometric_monitor_mismatch').count, 1);
  assert.equal(result.factors[0].type, 'multiple_faces');
});
