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
    displayName: 'Docente Uno',
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

test('returns the signed Moodle profile without exposing course data', async () => {
  const app = await buildPanelApp();
  const cookie = await signInPanel(app, [PANEL_CAPABILITIES.institution]);

  const response = await app.inject({ method: 'GET', url: '/v1/panel/me', headers: { cookie } });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().user, {
    canReview: true,
    canViewEvidence: false,
    displayName: 'Persona revisora',
    moodleUserId: 'reviewer-1',
    scope: 'institutional'
  });
  await app.close();
});

test('passes validated pagination and teacher scope to course queries', async () => {
  const received = [];
  const app = await buildPanelApp({
    repository: {
      async listCourses(scope, query) {
        received.push({ query, scope });
        return { courses: [], total: 0 };
      }
    }
  });
  const cookie = await signInPanel(app, [PANEL_CAPABILITIES.view]);

  const response = await app.inject({
    method: 'GET',
    url: '/v1/panel/courses?query=derecho&page=2&pageSize=50',
    headers: { cookie }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(received, [{
    query: { page: 2, pageSize: 50, query: 'derecho' },
    scope: { courseIds: ['course-a'], institutional: false }
  }]);
  await app.close();
});

test('hides a course outside the teacher scope before listing attempts', async () => {
  let repositoryCalls = 0;
  const app = await buildPanelApp({
    repository: {
      async listCourseSessions() {
        repositoryCalls += 1;
        return { sessions: [], total: 0 };
      }
    }
  });
  const cookie = await signInPanel(app, [PANEL_CAPABILITIES.view]);

  const response = await app.inject({
    method: 'GET',
    url: '/v1/panel/courses/course-b/sessions',
    headers: { cookie }
  });

  assert.equal(response.statusCode, 404);
  assert.equal(repositoryCalls, 0);
  await app.close();
});

test('passes validated attempt filters to the scoped repository query', async () => {
  const received = [];
  const app = await buildPanelApp({
    repository: {
      async listCourseSessions(courseId, scope, query) {
        received.push({ courseId, query, scope });
        return { sessions: [], total: 0 };
      }
    }
  });
  const cookie = await signInPanel(app, [PANEL_CAPABILITIES.view]);

  const response = await app.inject({
    method: 'GET',
    url: '/v1/panel/courses/course-a/sessions?query=ana&status=active&alerts=open&dateFrom=2026-08-01&dateTo=2026-08-21&page=3&pageSize=10',
    headers: { cookie }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(received[0], {
    courseId: 'course-a',
    query: {
      alerts: 'open',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-21',
      page: 3,
      pageSize: 10,
      query: 'ana',
      status: 'active'
    },
    scope: { courseIds: ['course-a'], institutional: false }
  });
  await app.close();
});

test('rejects a forged panel token', () => {
  const service = createPanelAuthService(secret);
  assert.equal(service.verifyMoodleToken(`${signToken({ exp: 9999999999 })}tampered`), null);
});

test('allows only institutional managers to require biometric re-enrollment', async () => {
  const resetCalls = [];
  const app = await buildPanelApp({
    biometricProfileRepository: {
      async reset(moodleUserId, actorMoodleUserId) {
        resetCalls.push({ actorMoodleUserId, moodleUserId });
        return { moodleUserId, state: 'revoked' };
      }
    }
  });
  const managerCookie = await signInPanel(app, [PANEL_CAPABILITIES.managePolicies, PANEL_CAPABILITIES.view]);
  const teacherCookie = await signInPanel(app, [PANEL_CAPABILITIES.view]);
  const path = '/v1/panel/biometric-profiles/student-1/reset';

  const managerResponse = await app.inject({ method: 'POST', url: path, headers: { cookie: managerCookie } });
  const teacherResponse = await app.inject({ method: 'POST', url: path, headers: { cookie: teacherCookie } });

  assert.equal(managerResponse.statusCode, 200);
  assert.deepEqual(managerResponse.json().biometric, { moodleUserId: 'student-1', state: 'revoked' });
  assert.equal(teacherResponse.statusCode, 403);
  assert.deepEqual(resetCalls, [{ actorMoodleUserId: 'reviewer-1', moodleUserId: 'student-1' }]);
  await app.close();
});

test('returns only alert evidence in an authorized session detail', async () => {
  const app = await buildPanelApp({
    repository: {
      async getSession() {
        return {
          id: '11111111-1111-4111-8111-111111111111',
          evidence: [
            { id: 'identity-evidence', kind: 'identity' },
            { id: 'interval-evidence', kind: 'interval' },
            { id: 'alert-evidence', kind: 'alert' }
          ]
        };
      }
    }
  });
  const cookie = await signInPanel(app, [PANEL_CAPABILITIES.institution, PANEL_CAPABILITIES.viewEvidence]);

  const response = await app.inject({
    method: 'GET',
    url: '/v1/panel/sessions/11111111-1111-4111-8111-111111111111',
    headers: { cookie }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().session.evidence, [{ id: 'alert-evidence', kind: 'alert' }]);
  await app.close();
});

test('refuses direct access to non-alert evidence', async () => {
  const accessed = [];
  const app = await buildPanelApp({
    evidenceRepository: {
      async findById(id) {
        return {
          id,
          courseId: 'course-a',
          kind: id.startsWith('2222') ? 'interval' : 'alert'
        };
      },
      async audit(input) {
        accessed.push(input.evidenceId);
      }
    }
  });
  const cookie = await signInPanel(app, [PANEL_CAPABILITIES.institution, PANEL_CAPABILITIES.viewEvidence]);
  const intervalId = '22222222-2222-4222-8222-222222222222';
  const alertId = '33333333-3333-4333-8333-333333333333';

  const interval = await app.inject({
    method: 'POST',
    url: `/v1/panel/evidence/${intervalId}/access`,
    headers: { cookie }
  });
  const alert = await app.inject({
    method: 'POST',
    url: `/v1/panel/evidence/${alertId}/access`,
    headers: { cookie }
  });

  assert.equal(interval.statusCode, 404);
  assert.equal(alert.statusCode, 200);
  assert.deepEqual(accessed, [alertId]);
  await app.close();
});

test('refuses a signed content token when the evidence is not an alert', async () => {
  let contentReads = 0;
  const evidenceId = '44444444-4444-4444-8444-444444444444';
  const app = await buildPanelApp({
    evidenceRepository: {
      async findById() {
        return { id: evidenceId, kind: 'interval', contentType: 'image/jpeg' };
      }
    },
    evidenceService: {
      async readAuthorized() {
        contentReads += 1;
        return Buffer.from('private image');
      }
    }
  });
  const accessToken = app.jwt.sign({
    evidenceId,
    moodleUserId: 'reviewer-1',
    aud: 'proctoring-evidence'
  }, { expiresIn: '60s' });

  const response = await app.inject({
    method: 'GET',
    url: `/v1/panel/evidence/${evidenceId}/content?accessToken=${encodeURIComponent(accessToken)}`
  });

  assert.equal(response.statusCode, 404);
  assert.equal(contentReads, 0);
  await app.close();
});

async function buildPanelApp(overrides = {}) {
  const authService = createPanelAuthService(secret);
  return buildApp({
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
      evidenceRepository: overrides.evidenceRepository ?? {},
      evidenceService: overrides.evidenceService ?? {},
      biometricProfileRepository: overrides.biometricProfileRepository ?? {},
      repository: overrides.repository ?? {},
      secureCookies: false,
      webOrigin: 'http://web.test'
    }
  });
}

async function signInPanel(app, capabilities) {
  const token = signToken({
    displayName: 'Persona revisora',
    moodleUserId: 'reviewer-1',
    capabilities,
    courseIds: ['course-a'],
    reviewCourseIds: ['course-a'],
    aud: 'proctoring-panel-sso',
    exp: Math.floor(Date.now() / 1000) + 60
  });
  const login = await app.inject({
    method: 'GET',
    url: `/v1/panel/sso?token=${encodeURIComponent(token)}&returnUrl=${encodeURIComponent('http://web.test/panel')}`
  });
  return login.headers['set-cookie'].split(';')[0];
}

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}
