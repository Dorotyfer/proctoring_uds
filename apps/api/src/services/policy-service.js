import { ProctoringPolicy } from '@proctoring/contracts';

const TYPE_PRIORITY = new Map([
  'multiple_faces',
  'biometric_monitor_mismatch',
  'biometric_mismatch',
  'environment_intrusion',
  'facial_pattern_detected',
  'camera_interrupted',
  'liveness_check_failed',
  'face_absent',
  'face_out_of_frame',
  'window_blur',
  'fullscreen_exit',
  'page_unload',
  'page_visibility_changed',
  'network_disconnected',
  'seb_event',
  'device_mode_mismatch'
].map((type, index) => [type, index]));

const DEFAULT_LIMITS = Object.freeze({ maxRules: 20 });

export function validatePolicy(policy, limits = DEFAULT_LIMITS) {
  const parsed = ProctoringPolicy.parse(policy);
  if (parsed.signals.length > limits.maxRules) {
    throw new Error(`Policy cannot contain more than ${limits.maxRules} rules`);
  }
  return normalizePolicy(parsed);
}

export function normalizePolicy(policy) {
  const parsed = ProctoringPolicy.parse(policy);
  return {
    version: parsed.version,
    signals: parsed.signals
      .map((signal, index) => ({ signal, index }))
      .sort((left, right) => {
        const priorityDifference = (TYPE_PRIORITY.get(left.signal.type) ?? Number.MAX_SAFE_INTEGER) -
          (TYPE_PRIORITY.get(right.signal.type) ?? Number.MAX_SAFE_INTEGER);
        return priorityDifference || left.index - right.index;
      })
      .map(({ signal }) => ({ ...signal }))
  };
}
