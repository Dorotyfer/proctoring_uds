import { z } from 'zod';

export const EventType = z.enum([
  'camera_interrupted',
  'face_absent',
  'multiple_faces',
  'face_out_of_frame',
  'identity_check_failed',
  'biometric_mismatch',
  'liveness_check_failed',
  'page_visibility_changed',
  'network_disconnected',
  'network_reconnected',
  'seb_event',
  'attention_signal'
]);

export const SessionEventInput = z.object({
  clientEventId: z.string().uuid(),
  type: EventType,
  occurredAt: z.string().datetime(),
  metadata: z.record(z.unknown()).default({}).refine(
    (metadata) => new TextEncoder().encode(JSON.stringify(metadata)).length <= 8192,
    'metadata must not exceed 8 KB'
  )
});
