const databaseName = 'proctoring-evidence';
const storeName = 'incidents';

export function createIncidentBuffer(
  sessionId,
  sender,
  storage = createIndexedDbStorage(sessionId),
  { now = () => Date.now(), retryDelaysMs = [1000, 3000, 10000, 30000] } = {}
) {
  let initialized = false;
  let memory = [];
  let lastError = null;
  const retryState = new Map();

  async function read() {
    if (!initialized) {
      const stored = await storage.read();
      memory = Array.isArray(stored) ? stored : [];
      initialized = true;
    }
    return [...memory];
  }

  async function write(items) {
    memory = [...items];
    initialized = true;
    await storage.write(memory);
  }

  return {
    async enqueue(incident) {
      await write([...(await read()), incident]);
    },
    async flush() {
      const pending = await read();
      const remaining = [...pending];
      lastError = null;
      for (const incident of pending) {
        const state = retryState.get(incident.clientEventId) ?? { attempts: 0, nextAttemptAt: 0 };
        if (now() < state.nextAttemptAt) {
          continue;
        }
        try {
          const response = await sender(incident);
          if (!isConfirmedDelivery(response)) {
            throw new Error('delivery_confirmation_missing');
          }
          retryState.delete(incident.clientEventId);
          remaining.shift();
          await write(remaining);
        } catch (error) {
          lastError = error;
          const attempts = state.attempts + 1;
          retryState.set(incident.clientEventId, {
            attempts,
            nextAttemptAt: now() + (retryDelaysMs[Math.min(attempts - 1, retryDelaysMs.length - 1)] ?? 30000)
          });
          break;
        }
      }
      return remaining.length;
    },
    async size() {
      return (await read()).length;
    },
    error() {
      return lastError;
    }
  };
}

function isConfirmedDelivery(response) {
  const incident = response?.incident;
  return typeof incident?.eventId === 'string' && incident.eventId.length > 0 &&
    typeof incident?.alertId === 'string' && incident.alertId.length > 0;
}

function createIndexedDbStorage(sessionId) {
  return {
    async read() {
      const database = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readonly');
        const request = transaction.objectStore(storeName).get(sessionId);
        request.onsuccess = () => resolve(request.result?.items ?? []);
        request.onerror = () => reject(request.error);
      });
    },
    async write(items) {
      const database = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        transaction.objectStore(storeName).put({ sessionId, items });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }
  };
}

function openDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('indexeddb_unavailable'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: 'sessionId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
