import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiLoadOperation } from '../src/pilot/api-load-scenario.js';

const jpegDataUrl = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9]).toString('base64')}`;

test('runs create, token, activation and event requests for one active session', async () => {
  const calls = [];
  const responses = [
    { session: { id: '11111111-1111-4111-8111-111111111111' } },
    { browserToken: 'browser-token' },
    { session: { id: '11111111-1111-4111-8111-111111111111', status: 'active' } },
    { alert: { severity: 'high' }, event: { id: 'event-1' } }
  ];
  const fetchImplementation = async (url, options) => {
    calls.push({ options, url });
    const payload = JSON.stringify(responses[calls.length - 1]);
    return new Response(payload, { status: calls.length === 1 || calls.length === 4 ? 201 : 200 });
  };
  const operation = createApiLoadOperation({
    apiUrl: 'https://api.example.edu',
    fetchImplementation,
    integrationKey: 'integration-key',
    referenceCapture: jpegDataUrl
  });
  const fixture = {
    courseName: 'Curso piloto A',
    deviceMode: 'browser',
    expiresAt: '2026-08-19T13:00:00.000Z',
    issuedAt: '2026-08-19T12:00:00.000Z',
    moodleAttemptId: 'pilot-attempt-0001',
    moodleCourseId: 'pilot-course-a',
    moodleQuizId: 'pilot-quiz-a',
    moodleUserId: 'pilot-student-0001',
    quizName: 'Evaluación piloto A',
    studentDocument: 'PILOT-0001',
    studentName: 'Estudiante piloto 0001'
  };
  const result = await operation(fixture);

  assert.equal(calls.length, 4);
  assert.equal(calls[0].url, 'https://api.example.edu/v1/internal/sessions');
  assert.equal(calls[0].options.headers['X-Moodle-Integration-Key'], 'integration-key');
  assert.equal(calls[2].options.headers.Authorization, 'Bearer browser-token');
  assert.match(calls[3].options.body, /camera_interrupted/);
  assert.equal(result.statusCode, 201);
  assert.ok(result.bytes > 0);
});

test('surfaces API status codes so the load runner can retry transient failures', async () => {
  const operation = createApiLoadOperation({
    apiUrl: 'https://api.example.edu',
    fetchImplementation: async () => new Response('{"error":"unavailable"}', { status: 503 }),
    integrationKey: 'integration-key',
    referenceCapture: jpegDataUrl
  });

  await assert.rejects(() => operation({ moodleAttemptId: 'attempt-1' }), /api_503/);
});
