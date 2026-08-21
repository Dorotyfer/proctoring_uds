import { z } from 'zod';

export const DeviceMode = z.enum(['browser', 'seb']);

export const SessionStatus = z.enum(['pending', 'active', 'completed', 'expired']);

export const CreateSessionInput = z.object({
  moodleUserId: z.string().trim().min(1),
  moodleCourseId: z.string().trim().min(1),
  moodleQuizId: z.string().trim().min(1),
  moodleAttemptId: z.string().trim().min(1),
  courseName: z.string().trim().min(1).max(255),
  quizName: z.string().trim().min(1).max(255),
  studentName: z.string().trim().min(1).max(255),
  studentDocument: z.string().trim().min(1).max(100).nullable(),
  deviceMode: DeviceMode,
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime()
}).superRefine((value, context) => {
  if (Date.parse(value.expiresAt) <= Date.parse(value.issuedAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expiresAt'],
      message: 'expiresAt must be later than issuedAt'
    });
  }
});

export const ProctoringSession = z.intersection(CreateSessionInput, z.object({
  id: z.string().uuid(),
  status: SessionStatus,
  createdAt: z.string().datetime()
}));
