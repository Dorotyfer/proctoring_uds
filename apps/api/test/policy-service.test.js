import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePolicy, normalizePolicy } from '../src/services/policy-service.js';

const validPolicy = {
  version: 'quiz-policy-3',
  signals: [
    {
      type: 'multiple_faces',
      count: 2,
      windowSeconds: 30,
      severity: 'high',
      capture: true,
      studentMessage: 'Se detectaron varios rostros.'
    },
    {
      type: 'window_blur',
      count: 1,
      windowSeconds: 5,
      severity: 'medium',
      capture: false,
      studentMessage: 'Mantenga visible la evaluación.'
    }
  ]
};

test('validates and deterministically prioritizes policy rules', () => {
  const parsed = validatePolicy({ ...validPolicy, signals: [...validPolicy.signals].reverse() });

  assert.deepEqual(parsed.signals.map((rule) => rule.type), ['multiple_faces', 'window_blur']);
  assert.equal(parsed.version, 'quiz-policy-3');
});

test('rejects policy payloads with executable or unknown fields', () => {
  assert.throws(() => validatePolicy({
    ...validPolicy,
    signals: [{ ...validPolicy.signals[0], evaluator: 'return true' }]
  }));
  assert.throws(() => validatePolicy({ ...validPolicy, unknown: true }));
});

test('normalizes equivalent rule order without mutating input', () => {
  const input = structuredClone(validPolicy);
  const normalized = normalizePolicy(input);

  assert.deepEqual(input, validPolicy);
  assert.notEqual(normalized, input);
  assert.deepEqual(normalized.signals.map((rule) => rule.type), ['multiple_faces', 'window_blur']);
});
