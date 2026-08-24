const DATABASE_NAME = 'proctoring-events-v1';
const STORE_NAME = 'events';
const MAXIMUM_EVENTS = 200;
const MAXIMUM_METADATA_BYTES = 8192;
const FORBIDDEN_KEY = /(image|frame|capture|blob|base64|descriptor|token)/i;
const EVENT_TYPES = new Set([
  'camera_interrupted',
  'page_visibility_changed',
  'network_disconnected',
  'network_reconnected',
  'seb_event'
]);

export function createEventQueue(sessionId, sender) {
  let databasePromise;
  let flushing = false;
  let retryTimer;

  function database() {
    if (!databasePromise) databasePromise = openDatabase(`${DATABASE_NAME}:${sessionId}`);
    return databasePromise;
  }

  async function enqueue(type, metadata = {}) {
    if (!EVENT_TYPES.has(type)) throw new Error('unsupported_event_type');
    const safeMetadata = validateMetadata(metadata);
    const event = {
      clientEventId: crypto.randomUUID(),
      type,
      occurredAt: new Date().toISOString(),
      metadata: safeMetadata
    };
    const db = await database();
    await transactionPromise(db, 'readwrite', (store) => store.put(event));
    await trimQueue(db);
    return event;
  }

  async function flush() {
    if (flushing || !navigator.onLine) return;
    flushing = true;
    try {
      const db = await database();
      const events = await requestPromise(db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll());
      events.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
      for (const stored of events) {
        try {
          await sender(stored);
          await transactionPromise(db, 'readwrite', (store) => store.delete(stored.clientEventId));
        } catch (error) {
          if ([400, 401, 403, 409].includes(error.status)) {
            await transactionPromise(db, 'readwrite', (store) => store.delete(stored.clientEventId));
            continue;
          }
          break;
        }
      }
    } finally {
      flushing = false;
    }
  }

  function start() {
    window.addEventListener('online', flush);
    retryTimer = window.setInterval(flush, 5000);
    void flush();
  }

  function stop() {
    window.removeEventListener('online', flush);
    window.clearInterval(retryTimer);
  }

  return { enqueue, flush, start, stop };
}

export function installSessionEventListeners(queue, { deviceMode, stream }) {
  const emit = (type, metadata) => void queue.enqueue(type, metadata).then(() => queue.flush()).catch(() => {});
  const visibility = () => emit('page_visibility_changed', { hidden: document.hidden });
  const offline = () => emit('network_disconnected', {});
  const online = () => emit('network_reconnected', {});
  const seb = (event) => emit('seb_event', {
    event: typeof event.detail?.type === 'string' ? event.detail.type.slice(0, 128) : 'browser-event',
    source: 'safe-exam-browser',
    version: safeSebVersion()
  });
  const cameraRemovers = [];

  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('offline', offline);
  window.addEventListener('online', online);
  window.addEventListener('sebEvent', seb);
  for (const track of stream.getVideoTracks()) {
    for (const type of ['ended', 'mute']) {
      const handler = () => emit('camera_interrupted', { source: `track-${type}` });
      track.addEventListener(type, handler);
      cameraRemovers.push(() => track.removeEventListener(type, handler));
    }
  }
  if (deviceMode === 'seb') {
    emit('seb_event', { event: 'monitor_started', source: 'safe-exam-browser', version: safeSebVersion() });
  }

  return () => {
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('offline', offline);
    window.removeEventListener('online', online);
    window.removeEventListener('sebEvent', seb);
    cameraRemovers.forEach((remove) => remove());
  };
}

function openDatabase(databaseName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.addEventListener('upgradeneeded', () => {
      const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'clientEventId' });
      store.createIndex('occurredAt', 'occurredAt');
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

async function trimQueue(database) {
  const count = await requestPromise(database.transaction(STORE_NAME).objectStore(STORE_NAME).count());
  let excess = count - MAXIMUM_EVENTS;
  if (excess <= 0) return;
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const request = transaction.objectStore(STORE_NAME).index('occurredAt').openKeyCursor();
    request.addEventListener('success', () => {
      const cursor = request.result;
      if (!cursor || excess <= 0) return;
      transaction.objectStore(STORE_NAME).delete(cursor.primaryKey);
      excess -= 1;
      cursor.continue();
    });
    transaction.addEventListener('complete', resolve);
    transaction.addEventListener('error', () => reject(transaction.error));
  });
}

function validateMetadata(metadata) {
  if (!metadata || Object.getPrototypeOf(metadata) !== Object.prototype) {
    throw new Error('invalid_event_metadata');
  }
  walkJson(metadata);
  const serialized = JSON.stringify(metadata);
  if (new TextEncoder().encode(serialized).byteLength > MAXIMUM_METADATA_BYTES) {
    throw new Error('event_metadata_too_large');
  }
  return JSON.parse(serialized);
}

function walkJson(value) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return;
  if (Array.isArray(value)) {
    value.forEach(walkJson);
    return;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error('invalid_event_metadata');
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error('forbidden_event_metadata');
    walkJson(child);
  }
}

function safeSebVersion() {
  const value = globalThis.SafeExamBrowser?.version;
  return typeof value === 'string' ? value.slice(0, 128) : null;
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function transactionPromise(database, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    operation(transaction.objectStore(STORE_NAME));
    transaction.addEventListener('complete', resolve);
    transaction.addEventListener('error', () => reject(transaction.error));
  });
}
