import assert from 'node:assert/strict';
import test from 'node:test';

import { createAlertService } from '../src/services/alert-service.js';

test('creates transparent human-review alerts for suspicious events', async () => {
  const created = [];
  const service = createAlertService({
    async createForEvent(event, severity) {
      created.push({ event, severity });
      return { eventId: event.id, severity, status: 'open' };
    }
  });

  const alert = await service.classify({ id: 'event-1', type: 'multiple_faces' });
  const ignored = await service.classify({ id: 'event-2', type: 'network_reconnected' });

  assert.equal(alert.severity, 'high');
  assert.equal(ignored, null);
  assert.equal(created.length, 1);
});
