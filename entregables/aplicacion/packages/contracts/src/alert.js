import { z } from 'zod';

export const AlertType = z.enum([
  'camera_interrupted',
  'face_absent',
  'multiple_faces',
  'face_out_of_frame',
  'identity_check_failed',
  'biometric_mismatch',
  'liveness_check_failed',
  'page_visibility_changed',
  'network_disconnected',
  'seb_event'
]);
