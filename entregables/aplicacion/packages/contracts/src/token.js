import { z } from 'zod';

export const BrowserClaims = z.object({
  sessionId: z.string().uuid(),
  moodleAttemptId: z.string().trim().min(1),
  deviceMode: z.enum(['browser', 'seb']),
  aud: z.literal('proctoring-browser'),
  exp: z.number().int().positive()
});

export const PanelClaims = z.object({
  moodleUserId: z.string().trim().min(1),
  capabilities: z.array(z.string().trim().min(1)),
  courseIds: z.array(z.string().trim().min(1)),
  expiresAt: z.string().datetime()
});
