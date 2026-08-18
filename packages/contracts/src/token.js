import { z } from 'zod';

export const DeviceMode = z.enum(['browser', 'seb']);

const Identifier = z.string().min(1);
const ExpiresAt = z.string().datetime();

export const PanelClaims = z.object({
  moodleUserId: Identifier,
  capabilities: z.array(Identifier).readonly(),
  courseIds: z.array(Identifier).readonly(),
  expiresAt: ExpiresAt
}).strict().readonly();

export const BrowserClaims = z.object({
  sessionId: Identifier,
  moodleAttemptId: Identifier,
  deviceMode: DeviceMode,
  aud: z.literal('proctoring-browser'),
  expiresAt: ExpiresAt
}).strict().readonly();
