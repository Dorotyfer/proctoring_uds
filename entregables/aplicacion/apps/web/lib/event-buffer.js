const maximumEvents = 200;

export function createEventBuffer(sessionId, sender, storage = window.localStorage) {
  const key = `proctoring-events:${sessionId}`;
  let initialized = false;
  let memory = [];

  function read() {
    if (initialized) {
      return [...memory];
    }
    try {
      memory = JSON.parse(storage.getItem(key) ?? '[]');
    } catch {
      memory = [];
    }
    initialized = true;
    return [...memory];
  }

  function write(events) {
    memory = events.slice(-maximumEvents);
    initialized = true;
    try {
      storage.setItem(key, JSON.stringify(memory));
    } catch {
      // Memory keeps the queue alive until storage or connectivity recovers.
    }
  }

  return {
    enqueue(type, metadata = {}) {
      const event = {
        clientEventId: crypto.randomUUID(),
        metadata,
        occurredAt: new Date().toISOString(),
        type
      };
      write([...read(), event]);
      return event;
    },
    async flush() {
      const pending = read();
      const remaining = [...pending];
      for (const event of pending) {
        try {
          await sender(event);
          remaining.shift();
          write(remaining);
        } catch (error) {
          if (['api_400', 'api_401', 'api_403', 'api_409'].includes(error.message)) {
            remaining.shift();
            write(remaining);
            continue;
          }
          break;
        }
      }
      return remaining.length;
    },
    size() {
      return read().length;
    }
  };
}
