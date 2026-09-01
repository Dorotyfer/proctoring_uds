import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeSessionRisk } from '../src/services/session-risk-analysis-service.js';

test('classifies a session without anomalies as normal', () => {
  const result = analyzeSessionRisk({ controlLevel: 'low', events: [], alerts: [] });

  assert.deepEqual(result, {
    category: 'normal',
    controlLevel: 'low',
    counts: {},
    reasons: [],
    score: 0
  });
});

test('weights critical and repeated signals into medium risk', () => {
  const result = analyzeSessionRisk({
    controlLevel: 'medium',
    events: [
      { type: 'face_absent' },
      { type: 'face_absent' },
      { type: 'page_visibility_changed' }
    ],
    alerts: [{ type: 'biometric_mismatch' }]
  });

  assert.equal(result.score, 63);
  assert.equal(result.category, 'medium_risk');
  assert.deepEqual(result.reasons.map(({ code, count }) => ({ code, count })), [
    { code: 'biometric_mismatch', count: 1 },
    { code: 'face_absent', count: 2 },
    { code: 'page_visibility_changed', count: 1 }
  ]);
});

test('caps repeated signals and the total score', () => {
  const result = analyzeSessionRisk({
    controlLevel: 'high',
    events: [
      ...Array.from({ length: 20 }, () => ({ type: 'face_absent' })),
      ...Array.from({ length: 20 }, () => ({ type: 'face_out_of_frame' })),
      ...Array.from({ length: 20 }, () => ({ type: 'network_disconnected' }))
    ],
    alerts: [
      { type: 'multiple_faces' },
      { type: 'liveness_check_failed' },
      { type: 'identity_check_failed' }
    ]
  });

  assert.equal(result.score, 100);
  assert.equal(result.category, 'high_risk');
  assert.equal(result.counts.face_absent, 20);
});

test('counts suspicious SEB events only when metadata requests it', () => {
  const result = analyzeSessionRisk({
    controlLevel: 'medium',
    events: [
      { type: 'seb_event', metadata: { suspicious: false } },
      { type: 'seb_event', metadata: { suspicious: true } },
      { type: 'unknown_event' }
    ],
    alerts: []
  });

  assert.equal(result.score, 15);
  assert.equal(result.category, 'normal');
  assert.deepEqual(result.reasons[0], {
    code: 'seb_event',
    count: 1,
    label: 'Evento sospechoso de Safe Exam Browser',
    points: 15
  });
});
