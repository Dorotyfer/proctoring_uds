import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AlertType,
  BrowserClaims,
  CreateSessionInput,
  DeviceMode,
  PanelClaims,
  SessionEventInput
} from '../src/index.js';

const validSession = {
  moodleUserId: 'user-42',
  moodleCourseId: 'course-7',
  moodleQuizId: 'quiz-11',
  moodleAttemptId: 'attempt-19',
  deviceMode: 'browser',
  issuedAt: '2026-08-18T12:00:00.000Z',
  expiresAt: '2026-08-18T12:15:00.000Z'
};

test('accepts browser and SEB session modes', () => {
  assert.equal(DeviceMode.parse('browser'), 'browser');
  assert.equal(DeviceMode.parse('seb'), 'seb');
  assert.throws(() => DeviceMode.parse('desktop'));
});

test('requires Moodle identifiers when creating a session', () => {
  assert.throws(() => CreateSessionInput.parse({ deviceMode: 'browser' }));
  assert.deepEqual(CreateSessionInput.parse(validSession), validSession);
});

test('requires session timestamps in chronological order', () => {
  assert.throws(() => CreateSessionInput.parse({
    ...validSession,
    expiresAt: '2026-08-18T11:59:59.000Z'
  }));
});

test('accepts only the proctoring event whitelist', () => {
  const expectedTypes = [
    'camera_interrupted',
    'face_absent',
    'multiple_faces',
    'face_out_of_frame',
    'identity_check_failed',
    'liveness_check_failed',
    'page_visibility_changed',
    'network_disconnected',
    'network_reconnected',
    'seb_event'
  ];

  for (const type of expectedTypes) {
    assert.equal(SessionEventInput.parse({
      sessionId: 'session-1',
      type,
      occurredAt: '2026-08-18T12:01:00.000Z'
    }).type, type);
  }

  assert.throws(() => SessionEventInput.parse({
    sessionId: 'session-1',
    type: 'unknown',
    occurredAt: '2026-08-18T12:01:00.000Z'
  }));
});

test('validates expiring panel and browser claims', () => {
  assert.deepEqual(PanelClaims.parse({
    moodleUserId: 'teacher-3',
    capabilities: ['local/proctoring:reviewowncoursealerts'],
    courseIds: ['course-7'],
    expiresAt: '2026-08-18T12:15:00.000Z'
  }), {
    moodleUserId: 'teacher-3',
    capabilities: ['local/proctoring:reviewowncoursealerts'],
    courseIds: ['course-7'],
    expiresAt: '2026-08-18T12:15:00.000Z'
  });

  assert.deepEqual(BrowserClaims.parse({
    sessionId: 'session-1',
    moodleAttemptId: 'attempt-19',
    deviceMode: 'seb',
    aud: 'proctoring-browser',
    expiresAt: '2026-08-18T12:15:00.000Z'
  }).aud, 'proctoring-browser');
});

test('limits alert types to reviewable proctoring conditions', () => {
  assert.equal(AlertType.parse('multiple_faces'), 'multiple_faces');
  assert.throws(() => AlertType.parse('network_reconnected'));
});
