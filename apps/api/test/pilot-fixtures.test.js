import assert from 'node:assert/strict';
import test from 'node:test';

import { createPilotFixtures } from '../src/pilot/pilot-fixtures.js';

test('creates deterministic isolated pilot sessions for browser and SEB', () => {
  const fixtures = createPilotFixtures({
    count: 4,
    issuedAt: '2026-08-19T12:00:00.000Z',
    seed: 'uds-pilot'
  });

  assert.deepEqual(fixtures, [
    {
      courseName: 'Curso piloto A',
      deviceMode: 'browser',
      expiresAt: '2026-08-19T13:00:00.000Z',
      issuedAt: '2026-08-19T12:00:00.000Z',
      moodleAttemptId: 'pilot-uds-pilot-attempt-0001',
      moodleCourseId: 'pilot-course-a',
      moodleQuizId: 'pilot-quiz-a',
      moodleUserId: 'pilot-student-0001',
      quizName: 'Evaluación piloto A',
      studentDocument: 'PILOT-0001',
      studentName: 'Estudiante piloto 0001'
    },
    {
      courseName: 'Curso piloto B',
      deviceMode: 'seb',
      expiresAt: '2026-08-19T13:00:00.000Z',
      issuedAt: '2026-08-19T12:00:00.000Z',
      moodleAttemptId: 'pilot-uds-pilot-attempt-0002',
      moodleCourseId: 'pilot-course-b',
      moodleQuizId: 'pilot-quiz-b',
      moodleUserId: 'pilot-student-0002',
      quizName: 'Evaluación piloto B',
      studentDocument: 'PILOT-0002',
      studentName: 'Estudiante piloto 0002'
    },
    {
      courseName: 'Curso piloto A',
      deviceMode: 'browser',
      expiresAt: '2026-08-19T13:00:00.000Z',
      issuedAt: '2026-08-19T12:00:00.000Z',
      moodleAttemptId: 'pilot-uds-pilot-attempt-0003',
      moodleCourseId: 'pilot-course-a',
      moodleQuizId: 'pilot-quiz-a',
      moodleUserId: 'pilot-student-0003',
      quizName: 'Evaluación piloto A',
      studentDocument: 'PILOT-0003',
      studentName: 'Estudiante piloto 0003'
    },
    {
      courseName: 'Curso piloto B',
      deviceMode: 'seb',
      expiresAt: '2026-08-19T13:00:00.000Z',
      issuedAt: '2026-08-19T12:00:00.000Z',
      moodleAttemptId: 'pilot-uds-pilot-attempt-0004',
      moodleCourseId: 'pilot-course-b',
      moodleQuizId: 'pilot-quiz-b',
      moodleUserId: 'pilot-student-0004',
      quizName: 'Evaluación piloto B',
      studentDocument: 'PILOT-0004',
      studentName: 'Estudiante piloto 0004'
    }
  ]);
});

test('rejects fixture counts outside the 1 to 1000 pilot boundary', () => {
  assert.throws(() => createPilotFixtures({ count: 0, issuedAt: '2026-08-19T12:00:00.000Z' }));
  assert.throws(() => createPilotFixtures({ count: 1001, issuedAt: '2026-08-19T12:00:00.000Z' }));
});
