const databaseName = 'proctoring-evidence';
const storeName = 'incidents';

export function createIncidentBuffer(sessionId, sender, storage = createIndexedDbStorage(sessionId)) {
  let initialized = false;
  let memory = [];
  let lastError = null;

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
        try {
          await sender(incident);
          remaining.shift();
          await write(remaining);
        } catch (error) {
          lastError = error;
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
