import assert from 'node:assert/strict';
import test from 'node:test';

import { mapIncidentCaptureStatus } from '../src/repositories/panel-repository.js';

test('maps an incident without a frame separately from a pending upload', () => {
  assert.equal(mapIncidentCaptureStatus('unavailable', null), 'unavailable');
  assert.equal(mapIncidentCaptureStatus('available', null), 'pending');
  assert.equal(mapIncidentCaptureStatus(null, 'evidence-1'), 'available');
});
