export function createRealtimeHub() {
  const subscribers = new Map();

  return {
    publish(sessionId, event) {
      for (const subscriber of subscribers.get(sessionId) ?? []) {
        subscriber(event);
      }
    },
    subscribe(sessionId, subscriber) {
      const sessionSubscribers = subscribers.get(sessionId) ?? new Set();
      sessionSubscribers.add(subscriber);
      subscribers.set(sessionId, sessionSubscribers);
      return () => {
        sessionSubscribers.delete(subscriber);
        if (sessionSubscribers.size === 0) subscribers.delete(sessionId);
      };
    }
  };
}
