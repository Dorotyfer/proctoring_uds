import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { createEventRepository } from '../src/repositories/event-repository.js';
import { createSessionRepository } from '../src/repositories/session-repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('persists ISO event timestamps in MariaDB DATETIME columns', { skip: !databaseUrl }, async () => {
  const sessions = createSessionRepository(databaseUrl);
  const events = createEventRepository(databaseUrl);
  const attemptId = `timestamp-${crypto.randomUUID()}`;

  try {
    const session = await sessions.create({
      courseName: 'Curso local',
      moodleUserId: 'local-student',
      moodleCourseId: 'local-course',
      moodleQuizId: 'local-quiz',
      moodleAttemptId: attemptId,
      quizName: 'Evaluación local',
      studentDocument: null,
      studentName: 'Estudiante local',
      deviceMode: 'browser',
      issuedAt: '2026-08-20T12:30:00.123Z',
      expiresAt: '2026-08-20T13:30:00.123Z'
    });
    const event = await events.create(session.id, {
      clientEventId: crypto.randomUUID(),
      type: 'camera_interrupted',
      occurredAt: '2026-08-20T12:31:00.456Z',
      metadata: { source: 'timestamp-test' }
    });

    assert.equal(event.occurredAt, '2026-08-20T12:31:00.456Z');
  } finally {
    await events.close();
    await sessions.close();
  }
});
