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
    createdAt: '2026-08-18T12:00:00.000Z',
    livenessChallengeId: 'd6396c8c-aa0f-4d14-bf97-c2d2d99e6b95'
  };

  const persisted = await new SessionRepository(database).create(session);

  assert.deepEqual(persisted, session);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/);
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
    session.createdAt,
    session.livenessChallengeId
  ]);
});

test('uses one guarded MySQL update to consume a liveness challenge and mark a session ready', async () => {
  const calls = [];
  const database = {
    async execute(sql, values) {
      calls.push({ sql, values });
      return [{ affectedRows: 1 }];
    }
  };

  const markedReady = await new SessionRepository(database).markPreparationReady({
    sessionId: 'e5b170c3-63c6-44a0-a9a8-f0ab702e6b21',
    challengeId: 'd6396c8c-aa0f-4d14-bf97-c2d2d99e6b95',
    completedAt: '2026-08-18T12:00:00.000Z'
  });

  assert.equal(markedReady, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /SET status = 'ready', liveness_challenge_completed_at = \?/);
  assert.match(calls[0].sql, /AND status = 'created'/);
  assert.match(calls[0].sql, /AND liveness_challenge_completed_at IS NULL/);
});

test('does not perform a partial readiness update when the guarded MySQL update affects no rows', async () => {
  const calls = [];
  const database = {
    async execute(sql, values) {
      calls.push({ sql, values });
      return [{ affectedRows: 0 }];
    }
  };

  const markedReady = await new SessionRepository(database).markPreparationReady({
    sessionId: 'e5b170c3-63c6-44a0-a9a8-f0ab702e6b21',
    challengeId: 'd6396c8c-aa0f-4d14-bf97-c2d2d99e6b95',
    completedAt: '2026-08-18T12:00:00.000Z'
  });

  assert.equal(markedReady, false);
  assert.equal(calls.length, 1);
});
