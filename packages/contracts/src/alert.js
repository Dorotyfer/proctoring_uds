import { z } from 'zod';

export const AlertType = z.enum([
  'camera_interrupted',
  'face_absent',
  'multiple_faces',
  'liveness_check_failed',
  'page_visibility_changed'
]);
