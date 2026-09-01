import assert from 'node:assert/strict';
import test from 'node:test';

import { createRealtimeHub } from '../src/services/realtime-hub.js';

test('publishes session updates to subscribers and removes them', () => {
  const hub = createRealtimeHub();
  const received = [];
  const unsubscribe = hub.subscribe('session-1', (event) => received.push(event));

  hub.publish('session-1', { type: 'session.updated', data: { riskScore: 40 } });
  hub.publish('session-2', { type: 'session.updated', data: { riskScore: 90 } });
  unsubscribe();
  hub.publish('session-1', { type: 'session.updated', data: { riskScore: 50 } });

  assert.deepEqual(received, [{ type: 'session.updated', data: { riskScore: 40 } }]);
});
