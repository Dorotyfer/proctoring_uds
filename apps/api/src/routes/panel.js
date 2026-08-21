import { z } from 'zod';

const ReviewInput = z.object({
  status: z.enum(['reviewed', 'dismissed']),
  note: z.string().trim().max(2000).default('')
});

const PaginationQuery = z.object({
  query: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

const SessionListQuery = PaginationQuery.extend({
  status: z.enum(['all', 'pending', 'active', 'completed', 'expired']).default('all'),
  alerts: z.enum(['all', 'open', 'any', 'none']).default('all'),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional()
});

export async function registerPanelRoutes(app, options) {
  app.get('/v1/panel/sso', async (request, reply) => {
    const parsed = z.object({
      token: z.string().min(1),
      returnUrl: z.string().url()
    }).safeParse(request.query);
    if (!parsed.success || new URL(parsed.data.returnUrl).origin !== options.webOrigin) {
      return reply.code(400).send({ error: 'Invalid panel sign-in request' });
    }
    const claims = options.authService.verifyMoodleToken(parsed.data.token);
    if (!claims || !options.authService.canView(claims)) {
      return reply.code(403).send({ error: 'Panel access denied' });
    }
    const sessionToken = app.jwt.sign({
      moodleUserId: claims.moodleUserId,
      displayName: claims.displayName,
      capabilities: claims.capabilities,
      courseIds: claims.courseIds,
      reviewCourseIds: claims.reviewCourseIds,
      aud: 'proctoring-panel'
    }, { expiresIn: '30m' });
    reply.setCookie(options.cookieName, sessionToken, cookieOptions(options));
    return reply.redirect(parsed.data.returnUrl);
  });

  app.post('/v1/panel/logout', async (request, reply) => {
    reply.clearCookie(options.cookieName, cookieOptions(options));
    return reply.code(204).send();
  });

  app.post('/v1/panel/biometric-profiles/:moodleUserId/reset', { preHandler: authorizePanel(options) }, async (request, reply) => {
    if (!options.authService.canManageBiometrics(request.panelUser)) {
      return reply.code(403).send({ error: 'Biometric profile management capability required' });
    }
    const moodleUserId = z.string().trim().min(1).max(255).safeParse(request.params.moodleUserId);
    if (!moodleUserId.success || !options.biometricProfileRepository) {
      return reply.code(400).send({ error: 'Invalid biometric profile request' });
    }
    const biometric = await options.biometricProfileRepository.reset(
      moodleUserId.data,
      request.panelUser.moodleUserId
    );
    return biometric ? { biometric } : reply.code(404).send({ error: 'Biometric profile not found' });
  });

  app.get('/v1/panel/me', { preHandler: authorizePanel(options) }, async (request) => ({
    user: {
      moodleUserId: request.panelUser.moodleUserId,
      displayName: request.panelUser.displayName,
      scope: options.authService.scope(request.panelUser).institutional ? 'institutional' : 'courses',
      canReview: options.authService.canReview(request.panelUser),
      canViewEvidence: options.authService.canViewEvidence(request.panelUser)
    }
  }));

  app.get('/v1/panel/courses', { preHandler: authorizePanel(options) }, async (request, reply) => {
    const query = PaginationQuery.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: 'Invalid course query' });
    }
    return options.repository.listCourses(options.authService.scope(request.panelUser), query.data);
  });

  app.get('/v1/panel/courses/:courseId/sessions', { preHandler: authorizePanel(options) }, async (request, reply) => {
    const courseId = z.string().trim().min(1).max(255).safeParse(request.params.courseId);
    const query = SessionListQuery.safeParse(request.query);
    if (!courseId.success || !query.success ||
      !isCourseAuthorized(courseId.data, request.panelUser, options.authService)) {
      return reply.code(404).send({ error: 'Course not found' });
    }
    return options.repository.listCourseSessions(
      courseId.data,
      options.authService.scope(request.panelUser),
      query.data
    );
  });

  app.get('/v1/panel/sessions', { preHandler: authorizePanel(options) }, async (request) => {
    return {
      sessions: await options.repository.listSessions(options.authService.scope(request.panelUser))
    };
  });

  app.get('/v1/panel/sessions/:sessionId', { preHandler: authorizePanel(options) }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.sessionId);
    if (!id.success) {
      return reply.code(400).send({ error: 'Invalid session identifier' });
    }
    const session = await options.repository.getSession(id.data, options.authService.scope(request.panelUser));
    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }
    if (!options.authService.canViewEvidence(request.panelUser)) {
      session.evidence = [];
    } else {
      session.evidence = session.evidence.filter((item) => item.kind === 'alert');
    }
    return { session };
  });

  app.post('/v1/panel/alerts/:alertId/review', { preHandler: authorizePanel(options) }, async (request, reply) => {
    if (!options.authService.canReview(request.panelUser)) {
      return reply.code(403).send({ error: 'Alert review capability required' });
    }
    const id = z.string().uuid().safeParse(request.params.alertId);
    const input = ReviewInput.safeParse(request.body);
    if (!id.success || !input.success) {
      return reply.code(400).send({ error: 'Invalid alert review' });
    }
    const alert = await options.repository.reviewAlert(
      id.data,
      request.panelUser.moodleUserId,
      input.data.status,
      input.data.note,
      options.authService.reviewScope(request.panelUser)
    );
    return alert ? { alert } : reply.code(404).send({ error: 'Alert not found' });
  });

  app.post('/v1/panel/evidence/:evidenceId/access', { preHandler: authorizePanel(options) }, async (request, reply) => {
    if (!options.authService.canViewEvidence(request.panelUser)) {
      return reply.code(403).send({ error: 'Evidence capability required' });
    }
    const id = z.string().uuid().safeParse(request.params.evidenceId);
    if (!id.success) {
      return reply.code(400).send({ error: 'Invalid evidence identifier' });
    }
    const evidence = await options.evidenceRepository.findById(id.data);
    if (!evidence || evidence.kind !== 'alert' ||
      !isCourseAuthorized(evidence.courseId, request.panelUser, options.authService)) {
      return reply.code(404).send({ error: 'Evidence not found' });
    }
    await options.evidenceRepository.audit(auditInput(request, evidence.id, 'view'));
    const accessToken = app.jwt.sign({
      evidenceId: evidence.id,
      moodleUserId: request.panelUser.moodleUserId,
      aud: 'proctoring-evidence'
    }, { expiresIn: '60s' });
    const apiBaseUrl = options.apiBaseUrl ?? options.apiOrigin;
    return { url: `${apiBaseUrl}/v1/panel/evidence/${evidence.id}/content?accessToken=${encodeURIComponent(accessToken)}` };
  });

  app.get('/v1/panel/evidence/:evidenceId/content', async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.evidenceId);
    try {
      const claims = app.jwt.verify(request.query.accessToken);
      if (!id.success || claims.aud !== 'proctoring-evidence' || claims.evidenceId !== id.data) {
        throw new Error('Invalid evidence access token');
      }
      const evidence = await options.evidenceRepository.findById(id.data);
      if (!evidence || evidence.kind !== 'alert') {
        return reply.code(404).send({ error: 'Evidence not found' });
      }
      const content = await options.evidenceService.readAuthorized(evidence);
      await options.evidenceRepository.audit({
        evidenceId: evidence.id,
        actorId: claims.moodleUserId,
        action: 'download',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? null
      });
      return reply.header('Cache-Control', 'private, no-store')
        .type(evidence.contentType)
        .send(content);
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired evidence access token' });
    }
  });
}

function authorizePanel(options) {
  return async function panelAuthorization(request, reply) {
    const token = request.cookies[options.cookieName];
    try {
      const claims = request.server.jwt.verify(token);
      if (claims.aud !== 'proctoring-panel' || !options.authService.canView(claims)) {
        throw new Error('Invalid panel session');
      }
      request.panelUser = claims;
    } catch {
      return reply.code(401).send({ error: 'Panel authentication required' });
    }
  };
}

function cookieOptions(options) {
  return {
    httpOnly: true,
    path: panelCookiePath(options),
    sameSite: options.secureCookies ? 'none' : 'lax',
    secure: options.secureCookies,
    maxAge: 1800
  };
}

function panelCookiePath(options) {
  try {
    const pathname = new URL(options.apiBaseUrl ?? options.apiOrigin).pathname.replace(/\/$/, '');
    return `${pathname}/v1/panel`.replace('//', '/');
  } catch {
    return '/v1/panel';
  }
}

function isCourseAuthorized(courseId, claims, authService) {
  const scope = authService.scope(claims);
  return scope.institutional || scope.courseIds.includes(String(courseId));
}

function auditInput(request, evidenceId, action) {
  return {
    evidenceId,
    actorId: request.panelUser.moodleUserId,
    action,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] ?? null
  };
}
