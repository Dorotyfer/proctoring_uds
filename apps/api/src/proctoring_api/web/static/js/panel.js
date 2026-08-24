import { PanelApiError } from './panel-api.js';

const COURSE_DEFAULTS = { query: '', page: 1, pageSize: 25 };
const SESSION_DEFAULTS = {
  query: '',
  page: 1,
  pageSize: 25,
  status: 'all',
  alerts: 'all',
  dateFrom: '',
  dateTo: ''
};

export function createPanel({ api, moodleOrigin, root, liveStatus }) {
  const state = {
    profile: null,
    courses: [],
    coursePage: {},
    courseFilters: { ...COURSE_DEFAULTS },
    selectedCourse: null,
    sessions: [],
    sessionPage: {},
    sessionFilters: { ...SESSION_DEFAULTS },
    selectedSession: null
  };

  async function initialize() {
    setBusy(true, 'Cargando sesión…');
    try {
      state.profile = await api.initialize();
      await loadCourses();
    } catch (error) {
      renderError(error);
    }
  }

  async function loadCourses() {
    setBusy(true, 'Cargando cursos…');
    try {
      const payload = await api.listCourses(state.courseFilters);
      state.courses = payload.courses;
      state.coursePage = payload;
      state.selectedCourse = null;
      state.selectedSession = null;
      renderCourses();
    } catch (error) {
      renderError(error);
    }
  }

  async function openCourse(course) {
    state.selectedCourse = course;
    state.selectedSession = null;
    state.sessionFilters = { ...SESSION_DEFAULTS };
    await loadSessions();
  }

  async function loadSessions() {
    setBusy(true, 'Cargando intentos…');
    try {
      const payload = await api.listSessions(state.selectedCourse.id, state.sessionFilters);
      state.sessions = payload.sessions;
      state.sessionPage = payload;
      renderSessions();
    } catch (error) {
      renderError(error);
    }
  }

  async function openSession(sessionId) {
    setBusy(true, 'Cargando detalle…');
    try {
      state.selectedSession = (await api.getSession(sessionId)).session;
      renderSessionDetail();
    } catch (error) {
      renderError(error);
    }
  }

  function renderFrame(content) {
    root.replaceChildren(userBar(), content);
    root.setAttribute('aria-busy', 'false');
  }

  function userBar() {
    const identity = el('div');
    identity.append(
      el('strong', { text: state.profile.displayName }),
      el('span', { text: state.profile.scope === 'institutional' ? 'Acceso institucional' : 'Acceso a cursos asignados' })
    );
    const logout = el('button', { className: 'text-button', text: 'Cerrar sesión', attrs: { type: 'button' } });
    logout.addEventListener('click', () => void logoutPanel());
    return el('header', { className: 'panel-userbar', children: [identity, logout] });
  }

  function renderCourses() {
    const section = el('section', { className: 'panel-content', attrs: { 'aria-labelledby': 'courses-title' } });
    const heading = el('div', { className: 'section-heading' });
    const title = el('div');
    title.append(el('p', { className: 'eyebrow', text: 'Cursos autorizados' }), el('h2', { text: 'Seleccioná un curso', attrs: { id: 'courses-title' } }));
    heading.append(title);

    const form = el('form', { className: 'panel-toolbar' });
    const search = inputField('Buscar curso', 'search', state.courseFilters.query);
    form.append(search.label, el('button', { className: 'button', text: 'Buscar', attrs: { type: 'submit' } }));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      state.courseFilters.query = search.input.value;
      state.courseFilters.page = 1;
      void loadCourses();
    });

    const grid = el('div', { className: 'course-grid' });
    for (const course of state.courses) {
      const details = el('span');
      details.append(
        el('strong', { text: course.name || `Curso ${course.id}` }),
        el('small', { text: `Código: ${course.code ?? course.id} · ${course.attemptCount} intentos registrados` })
      );
      const badge = el('span', {
        className: course.openAlertCount > 0 ? 'badge warning' : 'badge',
        text: `${course.openAlertCount} alertas abiertas`
      });
      const button = el('button', { className: 'course-card', attrs: { type: 'button' }, children: [details, badge] });
      button.addEventListener('click', () => void openCourse(course));
      grid.append(button);
    }
    if (state.courses.length === 0) {
      grid.append(el('p', { className: 'panel-state', text: state.courseFilters.query ? 'No encontramos cursos para esta búsqueda.' : 'No hay cursos con intentos registrados.' }));
    }
    section.append(heading, form, grid, pagination(state.courseFilters, state.coursePage, loadCourses, 'cursos'));
    renderFrame(section);
    announce('Cursos cargados.');
  }

  function renderSessions() {
    const section = el('section', { className: 'panel-content', attrs: { 'aria-labelledby': 'attempts-title' } });
    const back = el('button', { className: 'back-button', text: '← Volver a cursos', attrs: { type: 'button' } });
    back.addEventListener('click', () => {
      state.selectedCourse = null;
      renderCourses();
    });
    const heading = el('div', { className: 'section-heading' });
    const title = el('div');
    title.append(el('p', { className: 'eyebrow', text: 'Curso' }), el('h2', { text: state.selectedCourse.name || `Curso ${state.selectedCourse.id}`, attrs: { id: 'attempts-title' } }));
    heading.append(title, el('span', { text: `${state.sessionPage.total ?? 0} intentos` }));
    const filters = sessionFilterForm();
    const list = el('div', { className: 'attempt-list' });
    for (const session of state.sessions) {
      const identity = el('span');
      identity.append(
        el('strong', { text: session.studentName || 'Estudiante no informado' }),
        el('small', { text: `${session.studentDocumentLast4 || 'Documento no informado'} · ${session.quizName || `Cuestionario ${session.quizId}`}` })
      );
      const status = el('span');
      status.append(
        el('small', { text: `${formatDate(session.createdAt)} · ${session.deviceMode}` }),
        el('span', { className: session.openAlertCount > 0 ? 'badge warning' : 'badge', text: `${session.openAlertCount} abiertas` })
      );
      const button = el('button', { className: 'attempt-row', attrs: { type: 'button' }, children: [identity, status] });
      button.addEventListener('click', () => void openSession(session.id));
      list.append(button);
    }
    if (state.sessions.length === 0) list.append(el('p', { className: 'panel-state', text: 'No hay intentos que coincidan con los filtros.' }));
    section.append(back, heading, filters, list, pagination(state.sessionFilters, state.sessionPage, loadSessions, 'intentos'));
    renderFrame(section);
    announce('Intentos cargados.');
  }

  function sessionFilterForm() {
    const form = el('form', { className: 'attempt-filters' });
    const definitions = [
      ['query', 'Buscar', 'search', null],
      ['status', 'Estado', 'select', [['all', 'Todos'], ['pending', 'Pendiente'], ['active', 'Activo'], ['completed', 'Completado'], ['expired', 'Expirado']]],
      ['alerts', 'Alertas', 'select', [['all', 'Todas'], ['open', 'Abiertas'], ['any', 'Con alertas'], ['none', 'Sin alertas']]],
      ['dateFrom', 'Desde', 'date', null],
      ['dateTo', 'Hasta', 'date', null]
    ];
    for (const [name, labelText, type, options] of definitions) {
      const field = type === 'select' ? selectField(labelText, options, state.sessionFilters[name]) : inputField(labelText, type, state.sessionFilters[name]);
      field.input.addEventListener('change', () => {
        state.sessionFilters[name] = field.input.value;
        state.sessionFilters.page = 1;
        void loadSessions();
      });
      form.append(field.label);
    }
    form.addEventListener('submit', (event) => event.preventDefault());
    return form;
  }

  function renderSessionDetail() {
    const session = state.selectedSession;
    const section = el('section', { className: 'panel-content', attrs: { 'aria-labelledby': 'session-detail-title' } });
    const back = el('button', { className: 'back-button', text: '← Volver a intentos', attrs: { type: 'button' } });
    back.addEventListener('click', renderSessions);
    section.append(
      back,
      el('p', { className: 'eyebrow', text: `Intento ${session.attemptId}` }),
      el('h2', { text: session.studentName || 'Estudiante no informado', attrs: { id: 'session-detail-title' } }),
      detailSummary(session)
    );

    if (state.profile.scope === 'institutional' && session.moodleUserId) {
      const reset = el('button', { className: 'text-button', text: 'Exigir nueva inscripción biométrica', attrs: { type: 'button' } });
      reset.addEventListener('click', () => void resetBiometrics(session.moodleUserId));
      section.append(reset);
    }

    section.append(el('h3', { text: 'Alertas' }));
    if (session.alerts.length === 0) section.append(el('p', { text: 'Sin alertas.' }));
    for (const alert of session.alerts) section.append(alertCard(alert));

    section.append(el('h3', { text: 'Cronología' }));
    if (session.events.length === 0) section.append(el('p', { text: 'Sin eventos registrados.' }));
    for (const event of session.events) {
      section.append(el('article', { className: 'timeline-item', children: [
        el('strong', { text: event.type }),
        el('p', { text: formatDate(event.occurred_at) })
      ] }));
    }
    renderFrame(section);
    announce('Detalle de sesión cargado.');
  }

  function detailSummary(session) {
    const values = [
      ['Documento', session.studentDocument || 'No informado'],
      ['Cuestionario', session.quizName || `Cuestionario ${session.quizId}`],
      ['Estado', session.status],
      ['Modalidad', session.deviceMode],
      ['Biometría', biometricLabel(session.biometric?.status)]
    ];
    const list = el('dl', { className: 'detail-summary' });
    for (const [term, value] of values) {
      list.append(el('div', { children: [el('dt', { text: term }), el('dd', { text: value })] }));
    }
    return list;
  }

  function alertCard(alert) {
    const article = el('article', { className: 'timeline-item' });
    article.append(
      el('strong', { text: alertLabel(alert.type) }),
      el('span', { className: alert.severity === 'high' ? 'badge warning' : 'badge', text: alert.severity }),
      el('p', { text: `Estado: ${reviewLabel(alert.status)}${alert.review_note ? ` · ${alert.review_note}` : ''}` })
    );
    if (alert.evidenceId && state.profile.canViewEvidence) {
      const evidence = el('button', { className: 'text-button', text: 'Ver imagen de la incidencia', attrs: { type: 'button' } });
      evidence.addEventListener('click', () => void openEvidence(alert.evidenceId));
      article.append(evidence);
    } else if (alert.captureStatus === 'unavailable') {
      article.append(el('p', { text: 'Sin imagen disponible.' }));
    }
    if (alert.status === 'open' && state.profile.canReview) article.append(reviewForm(alert.id));
    return article;
  }

  function reviewForm(alertId) {
    const form = el('form', { className: 'review-form' });
    const status = selectField('Resultado de revisión', [['reviewed', 'Válida'], ['dismissed', 'Inválida']], 'reviewed');
    const noteLabel = el('label', { text: 'Nota de revisión' });
    const note = el('textarea', { attrs: { maxlength: '2000', rows: '3' } });
    noteLabel.append(note);
    form.append(status.label, noteLabel, el('button', { className: 'button', text: 'Guardar revisión', attrs: { type: 'submit' } }));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await api.reviewAlert(alertId, status.input.value, note.value);
        await openSession(state.selectedSession.id);
      } catch (error) {
        renderError(error);
      }
    });
    return form;
  }

  async function openEvidence(evidenceId) {
    try {
      const payload = await api.accessEvidence(evidenceId);
      window.open(payload.url, '_blank', 'noopener,noreferrer');
      announce('Evidencia abierta en una pestaña nueva.');
    } catch (error) {
      renderError(error);
    }
  }

  async function resetBiometrics(moodleUserId) {
    if (!window.confirm('¿Exigir una nueva inscripción biométrica para esta cuenta?')) return;
    try {
      await api.resetBiometricProfile(moodleUserId);
      await openSession(state.selectedSession.id);
      announce('Perfil biométrico restablecido.');
    } catch (error) {
      renderError(error);
    }
  }

  async function logoutPanel() {
    try {
      await api.logout();
    } catch {
      // Clear local capability state even when the server is temporarily unavailable.
    } finally {
      api.clearSecrets();
      if (moodleOrigin) {
        window.location.assign(moodleOrigin);
      } else {
        root.replaceChildren(el('section', { className: 'panel-message', children: [
          el('h2', { text: 'Sesión finalizada' }),
          el('p', { text: 'Ingresá desde Moodle para acceder al panel.' })
        ] }));
      }
    }
  }

  function renderError(error) {
    const unauthorized = error instanceof PanelApiError && error.status === 401;
    const message = unauthorized ? 'La sesión finalizó. Ingresá nuevamente desde Moodle.' : 'No fue posible cargar esta información.';
    const retry = el('button', { className: 'text-button', text: 'Reintentar', attrs: { type: 'button' } });
    retry.addEventListener('click', () => void initialize());
    root.replaceChildren(el('section', { className: 'panel-message error-text', children: [el('p', { text: message }), retry] }));
    root.setAttribute('aria-busy', 'false');
    announce(message);
  }

  function setBusy(value, message) {
    root.setAttribute('aria-busy', String(value));
    root.replaceChildren(el('p', { className: 'panel-message', text: message }));
    announce(message);
  }

  function announce(message) {
    liveStatus.textContent = message;
  }

  return { initialize };
}

function pagination(filters, page, loader, label) {
  const container = el('nav', { className: 'pagination', attrs: { 'aria-label': `Paginación de ${label}` } });
  const previous = el('button', { text: 'Anterior', attrs: { type: 'button' } });
  const next = el('button', { text: 'Siguiente', attrs: { type: 'button' } });
  const totalPages = Math.max(page.totalPages ?? 0, 1);
  previous.disabled = filters.page <= 1;
  next.disabled = filters.page >= (page.totalPages ?? 0);
  previous.addEventListener('click', () => {
    filters.page -= 1;
    void loader();
  });
  next.addEventListener('click', () => {
    filters.page += 1;
    void loader();
  });
  container.append(previous, el('span', { text: `Página ${filters.page} de ${totalPages}` }), next);
  return container;
}

function inputField(labelText, type, value) {
  const label = el('label', { text: labelText });
  const input = el('input', { attrs: { type, value: value ?? '' } });
  label.append(input);
  return { input, label };
}

function selectField(labelText, options, value) {
  const label = el('label', { text: labelText });
  const input = el('select');
  for (const [optionValue, text] of options) {
    const option = el('option', { text, attrs: { value: optionValue } });
    option.selected = optionValue === value;
    input.append(option);
  }
  label.append(input);
  return { input, label };
}

function el(tag, { className, text, attrs = {}, children = [] } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : 'Fecha no informada';
}

function biometricLabel(status) {
  return { enrolled: 'Registrada', matched: 'Coincidente', mismatch: 'No coincidente', revoked: 'Reinscripción requerida' }[status] ?? 'No registrada';
}

function reviewLabel(status) {
  return { reviewed: 'Válida', dismissed: 'Inválida' }[status] ?? 'Pendiente';
}

function alertLabel(type) {
  return type === 'biometric_mismatch' ? 'Identidad biométrica no coincidente' : type;
}
