import assert from 'node:assert/strict';
import test from 'node:test';

import { CreateSessionInput, SessionEventInput } from '../src/index.js';

const validSession = {
  moodleUserId: 'student-1',
  moodleCourseId: 'course-1',
  moodleQuizId: 'quiz-1',
  moodleAttemptId: 'attempt-1',
  courseName: 'Derecho Constitucional',
  quizName: 'Examen final',
  studentName: 'Ana Pérez',
  studentDocument: ' 1234567 ',
  deviceMode: 'browser',
  issuedAt: '2026-08-19T10:00:00.000Z',
  expiresAt: '2026-08-19T10:30:00.000Z'
};

test('accepts the supported device modes', () => {
  assert.equal(CreateSessionInput.parse(validSession).deviceMode, 'browser');
  assert.equal(CreateSessionInput.parse({ ...validSession, deviceMode: 'seb' }).deviceMode, 'seb');
});

test('rejects unsupported modes and invalid session durations', () => {
  assert.throws(() => CreateSessionInput.parse({ ...validSession, deviceMode: 'desktop' }));
  assert.throws(() => CreateSessionInput.parse({ ...validSession, expiresAt: validSession.issuedAt }));
});

test('normalizes panel metadata and accepts a missing student document', () => {
  const parsed = CreateSessionInput.parse(validSession);
  const withoutDocument = CreateSessionInput.parse({ ...validSession, studentDocument: null });

  assert.equal(parsed.studentDocument, '1234567');
  assert.equal(withoutDocument.studentDocument, null);
});

test('rejects missing or oversized panel metadata', () => {
  assert.throws(() => CreateSessionInput.parse({ ...validSession, courseName: '' }));
  assert.throws(() => CreateSessionInput.parse({ ...validSession, quizName: 'q'.repeat(256) }));
  assert.throws(() => CreateSessionInput.parse({ ...validSession, studentName: 's'.repeat(256) }));
  assert.throws(() => CreateSessionInput.parse({ ...validSession, studentDocument: 'd'.repeat(101) }));
});

test('accepts only the event whitelist', () => {
  assert.equal(SessionEventInput.parse({
    clientEventId: '56cc96a8-2ff1-41ca-9917-dd967c297319',
    type: 'camera_interrupted',
    occurredAt: '2026-08-19T10:10:00.000Z'
  }).type, 'camera_interrupted');
  assert.equal(SessionEventInput.parse({
    clientEventId: '56cc96a8-2ff1-41ca-9917-dd967c297319',
    type: 'biometric_mismatch',
    occurredAt: '2026-08-19T10:10:00.000Z'
  }).type, 'biometric_mismatch');
  assert.throws(() => SessionEventInput.parse({
    clientEventId: '56cc96a8-2ff1-41ca-9917-dd967c297319',
    type: 'unknown',
    occurredAt: '2026-08-19T10:10:00.000Z'
  }));
});
