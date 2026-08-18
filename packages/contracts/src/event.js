import { z } from 'zod';

import { IsoTimestamp, MoodleIdentifier } from './session.js';

export const SessionEventType = z.enum([
  'camera_interrupted',
  'face_absent',
  'multiple_faces',
  'face_out_of_frame',
  'identity_check_failed',
  'liveness_check_failed',
  'page_visibility_changed',
  'network_disconnected',
  'network_reconnected',
  'seb_event'
]);

export const SessionEventInput = z.object({
  sessionId: MoodleIdentifier,
  type: SessionEventType,
  occurredAt: IsoTimestamp
}).strict().readonly();
