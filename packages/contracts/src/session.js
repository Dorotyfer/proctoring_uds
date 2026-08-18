import { z } from 'zod';

import { DeviceMode } from './token.js';

export const MoodleIdentifier = z.string().min(1);
export const IsoTimestamp = z.string().datetime();

export const CreateSessionInput = z.object({
  moodleUserId: MoodleIdentifier,
  moodleCourseId: MoodleIdentifier,
  moodleQuizId: MoodleIdentifier,
  moodleAttemptId: MoodleIdentifier,
  deviceMode: DeviceMode,
  issuedAt: IsoTimestamp,
  expiresAt: IsoTimestamp
}).strict().refine(
  ({ issuedAt, expiresAt }) => new Date(expiresAt) > new Date(issuedAt),
  { message: 'expiresAt must be after issuedAt', path: ['expiresAt'] }
).readonly();
