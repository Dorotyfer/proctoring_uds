const DUPLICATE_WINDOW_MS = 250;

export function createDeviceSignalMonitor({
  emit,
  documentRef = document,
  windowRef = window,
  now = () => Date.now()
}) {
  const listeners = [];
  const startedAt = new Map();
  const lastEmittedAt = new Map();
  let running = false;

  function add(target, event, handler) {
    target.addEventListener(event, handler);
    listeners.push(() => target.removeEventListener(event, handler));
  }

  function send(type, metadata = {}, recoveryType = null) {
    const currentTime = now();
    const previousTime = lastEmittedAt.get(type);
    if (previousTime !== undefined && currentTime - previousTime < DUPLICATE_WINDOW_MS) {
      return;
    }
    lastEmittedAt.set(type, currentTime);
    const started = recoveryType ? startedAt.get(recoveryType) : undefined;
    if (started !== undefined) {
      metadata = { ...metadata, durationMs: Math.max(0, currentTime - started) };
      startedAt.delete(recoveryType);
    }
    void emit(type, { source: 'browser', ...metadata });
  }

  function markAndSend(type, metadata = {}) {
    startedAt.set(type, now());
    send(type, metadata);
  }

  const visibilityChanged = () => {
    if (documentRef.hidden) {
      send('page_visibility_changed', { hidden: true });
    } else {
      send('page_visibility_changed', { hidden: false }, 'page_visibility_changed');
    }
  };
  const blur = () => markAndSend('window_blur');
  const focus = () => send('window_focus', {}, 'window_blur');
  const fullscreenChanged = () => {
    if (!documentRef.fullscreenElement) send('fullscreen_exit');
  };
  const pageExit = (event) => send('page_unload', { event: event.type });
  const offline = () => markAndSend('network_disconnected');
  const online = () => send('network_reconnected', {}, 'network_disconnected');

  return {
    start() {
      if (running) return;
      running = true;
      add(documentRef, 'visibilitychange', visibilityChanged);
      add(documentRef, 'fullscreenchange', fullscreenChanged);
      add(windowRef, 'blur', blur);
      add(windowRef, 'focus', focus);
      add(windowRef, 'pagehide', pageExit);
      add(windowRef, 'beforeunload', pageExit);
      add(windowRef, 'offline', offline);
      add(windowRef, 'online', online);
    },
    stop() {
      if (!running) return;
      running = false;
      listeners.splice(0).forEach((remove) => remove());
      startedAt.clear();
      lastEmittedAt.clear();
    }
  };
}
