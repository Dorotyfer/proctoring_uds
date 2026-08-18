import assert from 'node:assert/strict';
import test from 'node:test';

import { SessionRepository } from '../src/repositories/session-repository.js';

test('persists a session using MySQL placeholders and returns its API shape', async () => {
  const calls = [];
  const database = {
    async execute(sql, values) {
      calls.push({ sql, values });
      return [{ affectedRows: 1 }];
    }
  };
  const session = {
    id: 'e5b170c3-63c6-44a0-a9a8-f0ab702e6b21',
    moodleUserId: 'user-42',
    moodleCourseId: 'course-17',
    moodleQuizId: 'quiz-3',
    moodleAttemptId: 'attempt-9',
    deviceMode: 'browser',
    status: 'created',
    issuedAt: '2026-08-18T12:00:00.000Z',
    expiresAt: '2026-08-18T13:00:00.000Z',
    createdAt: '2026-08-18T12:00:00.000Z'
  };

  const persisted = await new SessionRepository(database).create(session);

  assert.deepEqual(persisted, session);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/);
  assert.doesNotMatch(calls[0].sql, /RETURNING/);
  assert.deepEqual(calls[0].values, [
    session.id,
    session.moodleUserId,
    session.moodleCourseId,
    session.moodleQuizId,
    session.moodleAttemptId,
    session.deviceMode,
    session.status,
    session.issuedAt,
    session.expiresAt,
    session.createdAt
  ]);
});
