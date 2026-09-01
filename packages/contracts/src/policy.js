import { z } from 'zod';

export const PolicySignalType = z.enum([
  'multiple_faces',
  'face_absent',
  'face_out_of_frame',
  'camera_interrupted',
  'biometric_mismatch',
  'biometric_monitor_mismatch',
  'liveness_check_failed',
  'environment_intrusion',
  'facial_pattern_detected',
  'window_blur',
  'fullscreen_exit',
  'page_unload',
  'page_visibility_changed',
  'network_disconnected',
  'seb_event',
  'device_mode_mismatch'
]);

export const PolicySignal = z.object({
  type: PolicySignalType,
  count: z.number().int().min(1).max(10),
  windowSeconds: z.number().int().min(5).max(900),
  severity: z.enum(['low', 'medium', 'high']),
  capture: z.boolean(),
  studentMessage: z.string().max(240)
}).strict();

export const ProctoringPolicy = z.object({
  version: z.string().trim().min(1).max(64),
  signals: z.array(PolicySignal).max(20)
}).strict().superRefine((policy, context) => {
  const types = policy.signals.map((signal) => signal.type);
  const duplicateTypes = types.filter((type, index) => types.indexOf(type) !== index);
  if (duplicateTypes.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['signals'],
      message: `Duplicate policy signal types: ${[...new Set(duplicateTypes)].join(', ')}`
    });
  }
});

export const DEFAULT_PROCTORING_POLICY = Object.freeze({
  version: 'quiz-policy-3',
  signals: []
});
