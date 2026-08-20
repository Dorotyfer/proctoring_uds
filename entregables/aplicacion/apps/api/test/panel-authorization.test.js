import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { createPanelAuthService, PANEL_CAPABILITIES } from '../src/services/panel-auth-service.js';

const secret = 'panel-sso-secret-with-at-least-32-characters';

test('limits teacher panel queries to signed Moodle course claims', async () => {
  const receivedScopes = [];
  const authService = createPanelAuthService(secret);
  const app = await buildApp({
    eventService: {},
    healthService: { async check() {} },
    jwtSecret: 'api-test-secret',
    moodleIntegrationKey: 'moodle-key',
    sessionService: {},
    logger: false,
    panel: {
      apiOrigin: 'http://api.test',
      authService,
      cookieName: 'proctoring_panel',
      evidenceRepository: {},
      evidenceService: {},
      repository: {
        async listSessions(scope) {
          receivedScopes.push(scope);
          return [{ id: 'course-a-session', courseId: scope.courseIds[0] }];
        }
      },
      secureCookies: false,
      webOrigin: 'http://web.test'
    }
  });
  const token = signToken({
    moodleUserId: 'teacher-1',
    capabilities: [PANEL_CAPABILITIES.view, PANEL_CAPABILITIES.review],
    courseIds: ['course-a'],
    reviewCourseIds: ['course-a'],
    aud: 'proctoring-panel-sso',
    exp: Math.floor(Date.now() / 1000) + 60
  });
  const login = await app.inject({
    method: 'GET',
    url: `/v1/panel/sso?token=${encodeURIComponent(token)}&returnUrl=${encodeURIComponent('http://web.test/panel')}`
  });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const sessions = await app.inject({
    method: 'GET',
    url: '/v1/panel/sessions',
    headers: { cookie }
  });
  const evidence = await app.inject({
    method: 'POST',
    url: '/v1/panel/evidence/e3d9cce1-a5b8-4bfe-88e1-68a57475266d/access',
    headers: { cookie }
  });

  assert.equal(login.statusCode, 302);
  assert.equal(sessions.statusCode, 200);
  assert.equal(evidence.statusCode, 403);
  assert.deepEqual(receivedScopes, [{ courseIds: ['course-a'], institutional: false }]);
  assert.equal(sessions.json().sessions[0].courseId, 'course-a');
  await app.close();
});

test('gives institutional reviewers an explicit global scope', () => {
  const service = createPanelAuthService(secret);
  assert.deepEqual(service.scope({
    capabilities: [PANEL_CAPABILITIES.institution],
    courseIds: [],
    reviewCourseIds: []
  }), { courseIds: [], institutional: true });
});

test('rejects a forged panel token', () => {
  const service = createPanelAuthService(secret);
  assert.equal(service.verifyMoodleToken(`${signToken({ exp: 9999999999 })}tampered`), null);
});

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}
