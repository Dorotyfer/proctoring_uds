import { expect, it, vi } from 'vitest';

import { deliverIncident } from '@/lib/incident-delivery';
import { createIncident } from '@/lib/incident-payload';

it('marks an incident explicitly when no camera frame is available', () => {
  vi.stubGlobal('crypto', { randomUUID: () => 'client-event-1' });

  expect(createIncident('camera_interrupted', null, { source: 'camera-start' })).toEqual({
    capture: null,
    clientEventId: 'client-event-1',
    metadata: { captureStatus: 'unavailable', source: 'camera-start' },
    occurredAt: expect.any(String),
    type: 'camera_interrupted'
  });
});

it('sends the complete incident directly when persistent storage is unavailable', async () => {
  const incident = {
    capture: 'data:image/jpeg;base64,anBlZw==',
    clientEventId: 'e3d9cce1-a5b8-4bfe-88e1-68a57475266d',
    metadata: { captureStatus: 'available' },
    occurredAt: '2026-08-21T12:00:00.000Z',
    type: 'face_absent'
  };
  const sendIncident = vi.fn(async () => ({ incident: { evidenceId: 'evidence-1' } }));
  const sendSessionEvent = vi.fn();
  const buffer = { enqueue: vi.fn().mockRejectedValue(new Error('indexeddb_unavailable')), flush: vi.fn() };

  const result = await deliverIncident({ buffer, incident, sendIncident, sendSessionEvent, sessionId: 'session-1' });

  expect(result).toBe('sent_directly');
  expect(sendIncident).toHaveBeenCalledWith(incident);
  expect(sendSessionEvent).not.toHaveBeenCalled();
});

it('records an event fallback only after direct incident delivery also fails', async () => {
  const incident = {
    capture: null,
    clientEventId: 'f3d9cce1-a5b8-4bfe-88e1-68a57475266d',
    metadata: { captureStatus: 'unavailable' },
    occurredAt: '2026-08-21T12:00:00.000Z',
    type: 'camera_interrupted'
  };
  const sendIncident = vi.fn().mockRejectedValue(new Error('offline'));
  const sendSessionEvent = vi.fn(async () => ({}));
  const buffer = { enqueue: vi.fn().mockRejectedValue(new Error('indexeddb_unavailable')), flush: vi.fn() };

  const result = await deliverIncident({ buffer, incident, sendIncident, sendSessionEvent, sessionId: 'session-1' });

  expect(result).toBe('event_fallback');
  expect(sendSessionEvent).toHaveBeenCalledWith('session-1', {
    clientEventId: incident.clientEventId,
    metadata: { captureQueue: 'unavailable', captureStatus: 'unavailable' },
    occurredAt: incident.occurredAt,
    type: incident.type
  });
});
