const thresholds = {
  absent: 3,
  multiple: 2,
  'out-of-frame': 3
};

const eventTypes = {
  absent: 'face_absent',
  multiple: 'multiple_faces',
  'out-of-frame': 'face_out_of_frame'
};

const alertTypes = new Set([
  'camera_interrupted',
  'face_absent',
  'multiple_faces',
  'face_out_of_frame',
  'identity_check_failed',
  'liveness_check_failed',
  'page_visibility_changed',
  'network_disconnected',
  'seb_event'
]);

export function isAlertType(type) {
  return alertTypes.has(type);
}

export function createFaceStateTracker() {
  let count = 0;
  let current = 'valid';
  let emitted = false;

  return {
    update(next) {
      if (next !== current) {
        current = next;
        count = 0;
        emitted = false;
      }
      if (next === 'valid') {
        return null;
      }

      count += 1;
      if (!emitted && count >= thresholds[next]) {
        emitted = true;
        return eventTypes[next];
      }
      return null;
    }
  };
}

export function createAttentionSignalTracker(cooldownMs = 10000) {
  let lastExpression = null;
  let lastEmittedAt = null;

  return {
    update(signal, now = Date.now()) {
      if (!signal || now - (lastEmittedAt ?? -Infinity) < cooldownMs && signal.expression === lastExpression) {
        return null;
      }
      lastExpression = signal.expression;
      lastEmittedAt = now;
      return 'attention_signal';
    }
  };
}
