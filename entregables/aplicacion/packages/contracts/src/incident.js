import { z } from 'zod';

import { AlertType } from './alert.js';

const CaptureDataUrl = z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/);

export const IncidentInput = z.object({
  clientEventId: z.string().uuid(),
  type: AlertType,
  occurredAt: z.string().datetime(),
  metadata: z.record(z.unknown()).default({}).refine(
    (metadata) => new TextEncoder().encode(JSON.stringify(metadata)).length <= 8192,
    'metadata must not exceed 8 KB'
  ),
  capture: CaptureDataUrl.optional()
});
