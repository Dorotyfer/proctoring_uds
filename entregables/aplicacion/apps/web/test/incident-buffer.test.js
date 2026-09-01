import { afterEach, expect, it, vi } from 'vitest';

import { createIncidentBuffer } from '@/lib/incident-buffer';

afterEach(() => {
  vi.restoreAllMocks();
});

it('keeps an incident after a failed send and removes it only after confirmation', async () => {
  const records = [];
  let shouldFail = true;
  const sender = vi.fn(async (incident) => {
    records.push(incident);
    if (shouldFail) {
      throw new Error('offline');
    }
    return { incident: { eventId: 'event-1', evidenceId: 'evidence-1', status: 'open' } };
  });
  const storage = createMemoryStorage();
  const buffer = createIncidentBuffer('session-1', sender, storage);
  const incident = {
    capture: 'data:image/jpeg;base64,anBlZw==',
    clientEventId: 'e3d9cce1-a5b8-4bfe-88e1-68a57475266d',
    metadata: {},
    occurredAt: '2026-08-21T12:00:00.000Z',
    type: 'face_absent'
  };

  await buffer.enqueue(incident);
  expect(await buffer.flush()).toBe(1);
  expect(await buffer.size()).toBe(1);

  shouldFail = false;
  expect(await buffer.flush()).toBe(0);
  expect(await buffer.size()).toBe(0);
  expect(records).toHaveLength(2);
});

it('reloads incidents from persistent storage before flushing', async () => {
  const storage = createMemoryStorage();
  const incident = {
    capture: null,
    clientEventId: 'f3d9cce1-a5b8-4bfe-88e1-68a57475266d',
    metadata: {},
    occurredAt: '2026-08-21T12:00:00.000Z',
    type: 'camera_interrupted'
  };
  const first = createIncidentBuffer('session-1', async () => ({}), storage);
  await first.enqueue(incident);

  const sender = vi.fn(async () => ({}));
  const reloaded = createIncidentBuffer('session-1', sender, storage);

  expect(await reloaded.size()).toBe(1);
  await reloaded.flush();
  expect(sender).toHaveBeenCalledWith(incident);
});

function createMemoryStorage() {
  let value = [];
  return {
    async read() {
      return value;
    },
    async write(next) {
      value = next;
    }
  };
}
