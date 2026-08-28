import assert from 'node:assert/strict';
import test from 'node:test';

import { createEnvironmentSignalService } from '../src/services/environment-signal-service.js';
import { createFacialPatternService } from '../src/services/facial-pattern-service.js';

test('normalizes and records only approved facial pattern categories', async () => {
  const events = [];
  const service = createFacialPatternService({
    eventService: { async record(sessionId, event) { events.push({ sessionId, event }); return event; } },
    featureEnabled: true
  });

  await service.record('session-1', {
    category: 'negative',
    clientEventId: 'event-1',
    confidence: 0.876,
    modelVersion: 'model-1',
    occurredAt: '2026-08-28T12:00:00.000Z'
  }, 'policy-3');
  await service.record('session-1', { category: 'anger', confidence: 0.99 });

  assert.equal(events.length, 1);
  assert.deepEqual(events[0].event.metadata, {
    category: 'negative',
    confidence: 0.88,
    modelVersion: 'model-1',
    policyVersion: 'policy-3'
  });
});

test('bounds environment signal metadata before recording it', async () => {
  let event;
  const service = createEnvironmentSignalService({
    eventService: { async record(_sessionId, value) { event = value; return value; } },
    featureEnabled: true
  });

  await service.record('session-1', {
    box: { height: 2, width: -1, x: 0.123456, y: 0.5 },
    clientEventId: 'event-2',
    confidence: 0.918,
    modelVersion: 'model-1',
    objectCount: 2,
    objectType: 'phone',
    occurredAt: '2026-08-28T12:00:00.000Z'
  });

  assert.deepEqual(event.metadata.box, { height: 1, width: 0, x: 0.1235, y: 0.5 });
  assert.equal(event.metadata.objectCount, 2);
});
