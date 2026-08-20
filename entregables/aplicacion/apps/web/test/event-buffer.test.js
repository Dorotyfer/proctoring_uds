import { expect, it, vi } from 'vitest';

import { createEventBuffer } from '@/lib/event-buffer';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

it('keeps failed events and retries them in order', async () => {
  const sender = vi.fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({});
  const buffer = createEventBuffer('session-1', sender, createStorage());
  buffer.enqueue('network_disconnected');

  expect(await buffer.flush()).toBe(1);
  expect(await buffer.flush()).toBe(0);
  expect(sender).toHaveBeenCalledTimes(2);
});

it('keeps events in memory when browser storage is temporarily unavailable', async () => {
  let available = false;
  const values = new Map();
  const storage = {
    getItem(key) {
      if (!available) throw new Error('storage_unavailable');
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (!available) throw new Error('storage_unavailable');
      values.set(key, value);
    }
  };
  const sent = [];
  const buffer = createEventBuffer('session-1', async (event) => sent.push(event), storage);

  buffer.enqueue('camera_interrupted');
  expect(buffer.size()).toBe(1);
  available = true;
  expect(await buffer.flush()).toBe(0);
  expect(sent).toHaveLength(1);
});
