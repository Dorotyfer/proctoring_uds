import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { createAlertService } from '../src/services/alert-service.js';
import { createEventService } from '../src/services/event-service.js';
import { createPanelAuthService, PANEL_CAPABILITIES } from '../src/services/panel-auth-service.js';
import { createSessionService } from '../src/services/session-service.js';

const panelSecret = 'panel-sso-secret-with-at-least-32-characters';
const courseASessionId = '11111111-1111-4111-8111-111111111111';
const courseBSessionId = '22222222-2222-4222-8222-222222222222';
const identityEvidenceId = '77777777-7777-4777-8777-777777777777';
const evidenceId = '33333333-3333-4333-8333-333333333333';
const alertId = '44444444-4444-4444-8444-444444444444';

test('completes the Moodle-to-review pilot flow without cross-course or grading data', async () => {
  const state = createState();
  const app = await createPilotApp(state);
  const sessionA = await createMoodleSession(app, 'pilot-course-a', 'attempt-a');
  await createMoodleSession(app, 'pilot-course-b', 'attempt-b');

  const browserTokenResponse = await app.inject({
    method: 'POST',
    url: `/v1/internal/sessions/${sessionA.id}/browser-token`,
    headers: { 'x-moodle-integration-key': 'moodle-key' }
  });
  const browserToken = browserTokenResponse.json().browserToken;
  const browserHeaders = { authorization: `Bearer ${browserToken}` };
  const activation = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${sessionA.id}/activate`,
    headers: browserHeaders,
    payload: {
      identityPassed: true,
      livenessPassed: true,
      livenessChallenge: ['blink', 'turn-left'],
      referenceCapture: `data:image/jpeg;base64,${Buffer.from('pilot-jpeg').toString('base64')}`
    }
  });
  const event = await app.inject({
    method: 'POST',
    url: `/v1/sessions/${sessionA.id}/events`,
    headers: browserHeaders,
    payload: {
      clientEventId: '55555555-5555-4555-8555-555555555555',
      metadata: { source: 'pilot-camera' },
      occurredAt: new Date().toISOString(),
      type: 'camera_interrupted'
    }
  });

  const panelCookie = await signInTeacher(app);
  const sessions = await app.inject({
    method: 'GET',
    url: '/v1/panel/sessions',
    headers: { cookie: panelCookie }
  });
  const detail = await app.inject({
    method: 'GET',
    url: `/v1/panel/sessions/${sessionA.id}`,
    headers: { cookie: panelCookie }
  });
  const foreignDetail = await app.inject({
    method: 'GET',
    url: `/v1/panel/sessions/${courseBSessionId}`,
    headers: { cookie: panelCookie }
  });
  const evidenceAccess = await app.inject({
    method: 'POST',
    url: `/v1/panel/evidence/${evidenceId}/access`,
    headers: { cookie: panelCookie }
  });
  const contentUrl = new URL(evidenceAccess.json().url);
  const evidenceContent = await app.inject({
    method: 'GET',
    url: `${contentUrl.pathname}${contentUrl.search}`
  });
  const review = await app.inject({
    method: 'POST',
    url: `/v1/panel/alerts/${alertId}/review`,
    headers: { cookie: panelCookie },
    payload: { note: 'Interrupción verificada con el estudiante.', status: 'reviewed' }
  });

  assert.equal(browserTokenResponse.statusCode, 200);
  assert.equal(activation.statusCode, 200);
  assert.equal(event.statusCode, 201);
  assert.equal(event.json().alert.severity, 'high');
  assert.deepEqual(sessions.json().sessions.map((session) => session.courseId), ['pilot-course-a']);
  assert.equal(detail.json().session.alerts[0].status, 'open');
  assert.equal(foreignDetail.statusCode, 404);
  assert.equal(evidenceContent.body, 'pilot-jpeg');
  assert.deepEqual(state.auditActions, ['view', 'download']);
  assert.equal(review.json().alert.status, 'reviewed');
  assert.equal(JSON.stringify(review.json()).includes('grade'), false);
  await app.close();
});

async function createPilotApp(state) {
  const sessionRepository = createSessionRepository(state);
  const evidenceService = {
    async storeIdentity(sessionId) {
      state.identityEvidence.sessionId = sessionId;
      return state.identityEvidence;
    },
    async readAuthorized() {
      return Buffer.from('pilot-jpeg');
    }
  };
  const sessionService = createSessionService(sessionRepository, evidenceService);
  const alertService = createAlertService({
    async createForEvent(event, severity) {
      state.alert = {
        createdAt: new Date().toISOString(),
        eventId: event.id,
        id: alertId,
        reviewNote: null,
        reviewedAt: null,
        reviewedBy: null,
        sessionId: event.sessionId,
        severity,
        status: 'open',
        type: event.type
      };
      state.alertEvidence.sessionId = event.sessionId;
      return state.alert;
    }
  });
  const eventService = createEventService(sessionService, {
    async create(sessionId, input) {
      state.event = {
        ...input,
        id: '66666666-6666-4666-8666-666666666666',
        receivedAt: new Date().toISOString(),
        sessionId
      };
      return state.event;
    }
  }, alertService);
  const authService = createPanelAuthService(panelSecret);

  return buildApp({
    eventService,
    evidenceService,
    healthService: { async check() {} },
    jwtSecret: 'pilot-api-jwt-secret',
    moodleIntegrationKey: 'moodle-key',
    sessionService,
    logger: false,
    panel: {
      apiOrigin: 'http://api.test',
      authService,
      cookieName: 'proctoring_panel',
      evidenceRepository: createEvidenceRepository(state),
      evidenceService,
      repository: createPanelRepository(state),
      secureCookies: false,
      webOrigin: 'http://web.test'
    }
  });
}

function createState() {
  return {
    alert: null,
    auditActions: [],
    alertEvidence: {
      contentType: 'image/jpeg',
      courseId: 'pilot-course-a',
      encryptionIv: Buffer.alloc(12),
      encryptionTag: Buffer.alloc(16),
      id: evidenceId,
      kind: 'alert',
      objectKey: 'pilot/alert.enc'
    },
    event: null,
    identityEvidence: {
      contentType: 'image/jpeg',
      courseId: 'pilot-course-a',
      encryptionIv: Buffer.alloc(12),
      encryptionTag: Buffer.alloc(16),
      id: identityEvidenceId,
      kind: 'identity',
      objectKey: 'pilot/identity.enc'
    },
    sessions: new Map()
  };
}

function createSessionRepository(state) {
  return {
    async create(input) {
      const id = input.moodleCourseId === 'pilot-course-a' ? courseASessionId : courseBSessionId;
      const session = { ...input, createdAt: input.issuedAt, id, status: 'pending' };
      state.sessions.set(id, session);
      return session;
    },
    async findById(id) {
      return state.sessions.get(id) ?? null;
    },
    async activate(id, preparation) {
      const session = state.sessions.get(id);
      const active = { ...session, referenceEvidenceId: preparation.evidenceId, status: 'active' };
      state.sessions.set(id, active);
      return active;
    }
  };
}

function createEvidenceRepository(state) {
  return {
    async audit(input) {
      state.auditActions.push(input.action);
    },
    async findById(id) {
      if (id === evidenceId) return state.alertEvidence;
      if (id === identityEvidenceId) return state.identityEvidence;
      return null;
    }
  };
}

function createPanelRepository(state) {
  function allowed(session, scope) {
    return scope.institutional || scope.courseIds.includes(session.moodleCourseId);
  }
  return {
    async getSession(id, scope) {
      const session = state.sessions.get(id);
      if (!session || !allowed(session, scope)) return null;
      return {
        alerts: state.alert?.sessionId === id ? [toPanelAlert(state.alert)] : [],
        attemptId: session.moodleAttemptId,
        courseId: session.moodleCourseId,
        createdAt: session.createdAt,
        deviceMode: session.deviceMode,
        events: state.event?.sessionId === id ? [state.event] : [],
        evidence: [state.identityEvidence, state.alertEvidence].filter((item) => item.sessionId === id),
        id,
        quizId: session.moodleQuizId,
        status: session.status
      };
    },
    async listSessions(scope) {
      return [...state.sessions.values()].filter((session) => allowed(session, scope)).map((session) => ({
        alertCount: state.alert?.sessionId === session.id ? 1 : 0,
        courseId: session.moodleCourseId,
        id: session.id,
        openAlertCount: state.alert?.sessionId === session.id && state.alert.status === 'open' ? 1 : 0
      }));
    },
    async reviewAlert(id, reviewerId, status, note, scope) {
      const session = state.sessions.get(state.alert.sessionId);
      if (id !== alertId || !allowed(session, scope)) return null;
      state.alert = { ...state.alert, reviewNote: note, reviewedBy: reviewerId, status };
      return { id, review_note: note, reviewed_by: reviewerId, status };
    }
  };
}

function toPanelAlert(alert) {
  return {
    created_at: alert.createdAt,
    event_id: alert.eventId,
    id: alert.id,
    review_note: alert.reviewNote,
    reviewed_at: alert.reviewedAt,
    reviewed_by: alert.reviewedBy,
    severity: alert.severity,
    status: alert.status,
    type: alert.type
  };
}

async function createMoodleSession(app, courseId, attemptId) {
  const issuedAt = new Date(Date.now() - 60 * 1000);
  const expiresAt = new Date(issuedAt.getTime() + 60 * 60 * 1000);
  const response = await app.inject({
    method: 'POST',
    url: '/v1/internal/sessions',
    headers: { 'x-moodle-integration-key': 'moodle-key' },
    payload: {
      courseName: `Curso ${courseId}`,
      deviceMode: courseId.endsWith('a') ? 'browser' : 'seb',
      expiresAt: expiresAt.toISOString(),
      issuedAt: issuedAt.toISOString(),
      moodleAttemptId: attemptId,
      moodleCourseId: courseId,
      moodleQuizId: `quiz-${courseId}`,
      moodleUserId: `student-${courseId}`,
      quizName: `Evaluación ${courseId}`,
      studentDocument: `DOC-${courseId}`,
      studentName: `Estudiante ${courseId}`
    }
  });
  assert.equal(response.statusCode, 201);
  return response.json().session;
}

async function signInTeacher(app) {
  const token = signPanelToken({
    aud: 'proctoring-panel-sso',
    capabilities: [PANEL_CAPABILITIES.view, PANEL_CAPABILITIES.review, PANEL_CAPABILITIES.viewEvidence],
    courseIds: ['pilot-course-a'],
    displayName: 'Docente piloto',
    exp: Math.floor(Date.now() / 1000) + 60,
    moodleUserId: 'pilot-teacher-a',
    reviewCourseIds: ['pilot-course-a']
  });
  const response = await app.inject({
    method: 'GET',
    url: `/v1/panel/sso?token=${encodeURIComponent(token)}&returnUrl=${encodeURIComponent('http://web.test/panel')}`
  });
  assert.equal(response.statusCode, 302);
  return response.headers['set-cookie'].split(';')[0];
}

function signPanelToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', panelSecret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}
