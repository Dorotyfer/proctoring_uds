'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { createPanelApi } from '../lib/panel-api.js';
import AttemptList from './AttemptList.jsx';
import BiometricProfileList from './BiometricProfileList.jsx';
import CourseList from './CourseList.jsx';
import PanelDialog from './PanelDialog.jsx';
import PanelSessionDetail from './PanelSessionDetail.jsx';

const initialCourseFilters = { page: 1, pageSize: 25, query: '' };
const initialAttemptFilters = { alerts: 'all', dateFrom: '', dateTo: '', page: 1, pageSize: 25, query: '', status: 'all' };
const initialBiometricFilters = { page: 1, pageSize: 25, query: '' };

export default function PanelDashboard({ apiUrl, moodleReturnUrl }) {
  const api = useMemo(() => createPanelApi(apiUrl), [apiUrl]);
  const [authStatus, setAuthStatus] = useState('loading');
  const [contentStatus, setContentStatus] = useState('loading');
  const [profile, setProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [courseFilters, setCourseFilters] = useState(initialCourseFilters);
  const [attemptFilters, setAttemptFilters] = useState(initialAttemptFilters);
  const [coursePagination, setCoursePagination] = useState({ total: 0, totalPages: 0 });
  const [attemptPagination, setAttemptPagination] = useState({ total: 0, totalPages: 0 });
  const [biometricProfiles, setBiometricProfiles] = useState([]);
  const [biometricFilters, setBiometricFilters] = useState(initialBiometricFilters);
  const [biometricPagination, setBiometricPagination] = useState({ total: 0, totalPages: 0 });
  const [showBiometricProfiles, setShowBiometricProfiles] = useState(false);
  const [contentError, setContentError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const closeDialog = useCallback(() => setDialog(null), []);
  const overview = useMemo(() => ({
    courses: coursePagination.total ?? courses.length,
    attempts: courses.reduce((total, course) => total + (course.attemptCount ?? 0), 0),
    alerts: courses.reduce((total, course) => total + (course.openAlertCount ?? 0), 0)
  }), [coursePagination.total, courses]);

  const loadCourses = useCallback(async (filters = courseFilters) => {
    setContentError(null);
    setContentStatus('loading');
    try {
      const payload = await api.listCourses(filters);
      setCourses(payload.courses);
      setCoursePagination(payload);
      setContentStatus('ready');
    } catch (error) {
      handleRequestError(error, setAuthStatus, setContentStatus);
    }
  }, [api, courseFilters]);

  const loadSessions = useCallback(async (course = selectedCourse, filters = attemptFilters) => {
    if (!course) {
      return;
    }
    setContentError(null);
    setContentStatus('loading');
    try {
      const payload = await api.listSessions(course.id, filters);
      setSessions(payload.sessions);
      setAttemptPagination(payload);
      setContentStatus('ready');
    } catch (error) {
      handleRequestError(error, setAuthStatus, setContentStatus);
    }
  }, [api, attemptFilters, selectedCourse]);

  const loadBiometricProfiles = useCallback(async (filters = biometricFilters) => {
    setContentError(null);
    setContentStatus('loading');
    try {
      const payload = await api.listBiometricProfiles(filters);
      setBiometricProfiles(payload.profiles);
      setBiometricPagination(payload);
      setContentStatus('ready');
    } catch (error) {
      handleRequestError(error, setAuthStatus, setContentStatus);
    }
  }, [api, biometricFilters]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const payload = await api.getProfile();
        if (!active) return;
        setProfile(payload.user);
        setAuthStatus('ready');
        const coursePayload = await api.listCourses(initialCourseFilters);
        if (!active) return;
        setCourses(coursePayload.courses);
        setCoursePagination(coursePayload);
        setContentStatus('ready');
      } catch (error) {
        if (!active) return;
        handleRequestError(error, setAuthStatus, setContentStatus);
      }
    }
    void initialize();
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    if (!selectedSession) {
      return undefined;
    }
    return api.subscribeSession(selectedSession.id, (session) => setSelectedSession(session));
  }, [api, selectedSession?.id]);

  async function openCourse(course) {
    setShowBiometricProfiles(false);
    setSelectedCourse(course);
    setSelectedSession(null);
    await loadSessions(course, attemptFilters);
  }

  async function openBiometricProfiles() {
    setShowBiometricProfiles(true);
    setSelectedCourse(null);
    setSelectedSession(null);
    setBiometricFilters(initialBiometricFilters);
    await loadBiometricProfiles(initialBiometricFilters);
  }

  async function changeBiometricFilters(filters) {
    setBiometricFilters(filters);
    await loadBiometricProfiles(filters);
  }

  function resetListedBiometricProfile(moodleUserId) {
    setDialog({
      type: 'reset-listed-profile',
      moodleUserId,
      title: 'Revocar perfil biométrico',
      description: 'La cuenta tendrá que completar una nueva inscripción biométrica antes de volver a rendir.'
    });
  }

  async function openSession(sessionId) {
    setContentError(null);
    setContentStatus('loading');
    try {
      const payload = await api.getSession(sessionId);
      setSelectedSession(payload.session);
      setContentStatus('ready');
    } catch (error) {
      setContentError({ type: 'session', id: sessionId });
      handleRequestError(error, setAuthStatus, setContentStatus);
    }
  }

  async function exportCourseReport() {
    try {
      const csv = await api.reportCsv(selectedCourse.id, attemptFilters);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      link.download = `proctoring-${selectedCourse.id}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      handleRequestError(error, setAuthStatus, setContentStatus);
    }
  }

  async function changeCourseFilters(filters) {
    setCourseFilters(filters);
    await loadCourses(filters);
  }

  async function changeAttemptFilters(filters) {
    setAttemptFilters(filters);
    await loadSessions(selectedCourse, filters);
  }

  function reviewAlert(alertId, reviewStatus) {
    setDialog({
      type: 'review-alert',
      alertId,
      reviewStatus,
      title: reviewStatus === 'reviewed' ? 'Marcar alerta como válida' : 'Marcar alerta como inválida',
      description: 'La decisión quedará registrada en el historial de revisión. Podés agregar una nota para justificarla.'
    });
  }

  async function openEvidence(evidenceId) {
    try {
      const payload = await api.accessEvidence(evidenceId);
      window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      handleRequestError(error, setAuthStatus, setContentStatus);
    }
  }

  function resetBiometrics(moodleUserId) {
    setDialog({
      type: 'reset-session-profile',
      moodleUserId,
      title: 'Exigir nueva inscripción',
      description: 'La cuenta deberá registrar nuevamente su biometría antes de iniciar otro intento.'
    });
  }

  async function confirmDialog() {
    if (!dialog) {
      return;
    }
    setDialog((current) => ({ ...current, pending: true }));
    try {
      if (dialog.type === 'reset-listed-profile') {
        await api.resetBiometricProfile(dialog.moodleUserId);
        await loadBiometricProfiles();
      }
      if (dialog.type === 'reset-session-profile') {
        await api.resetBiometricProfile(dialog.moodleUserId);
        await openSession(selectedSession.id);
      }
      if (dialog.type === 'review-alert') {
        await api.reviewAlert(dialog.alertId, dialog.reviewStatus, dialog.note ?? '');
        await openSession(selectedSession.id);
        await loadSessions(selectedCourse, attemptFilters);
      }
      setDialog(null);
    } catch (error) {
      setDialog((current) => ({ ...current, pending: false }));
      handleRequestError(error, setAuthStatus, setContentStatus);
    }
  }

  async function logout() {
    await api.logout().catch(() => null);
    if (moodleReturnUrl) {
      window.location.assign(moodleReturnUrl);
    } else {
      setAuthStatus('unauthorized');
    }
  }

  if (authStatus === 'loading') return <p className="panel-message">Cargando sesión…</p>;
  if (authStatus === 'unauthorized') return <section className="panel-message panel-login"><h2>Sesión finalizada</h2><p>Ingresá desde Moodle para acceder al panel.</p></section>;
  if (authStatus === 'error') return <section className="panel-message error-text"><p>No fue posible consultar el servicio.</p><button className="text-button" type="button" onClick={() => window.location.reload()}>Reintentar</button></section>;

  return (
    <div className="panel-app">
      <header className="panel-userbar">
        <div className="panel-identity"><span className="identity-mark" aria-hidden="true">PU</span><span><strong>{profile.displayName}</strong><span>{profile.scope === 'institutional' ? 'Acceso institucional' : 'Acceso a cursos asignados'}</span></span></div>
        <div className="button-row"><button className="text-button" type="button" onClick={logout}>Cerrar sesión</button>{profile.scope === 'institutional' ? <button className="button" type="button" onClick={openBiometricProfiles}>Perfiles biométricos</button> : null}</div>
      </header>
      {!showBiometricProfiles && !selectedCourse && !selectedSession ? <section className="panel-overview" aria-label="Resumen operativo">
        <div className="overview-intro"><span className="live-indicator"><span aria-hidden="true" /> Sistema operativo</span><h2>Vista general</h2><p>Revisá el estado de tus evaluaciones desde un solo lugar.</p></div>
        <div className="overview-stats">
          <div className="overview-stat"><span className="stat-icon" aria-hidden="true">⌁</span><span><strong>{overview.courses}</strong><small>Cursos activos</small></span></div>
          <div className="overview-stat"><span className="stat-icon" aria-hidden="true">↗</span><span><strong>{overview.attempts}</strong><small>Intentos en cursos visibles</small></span></div>
          <div className="overview-stat"><span className="stat-icon stat-icon-alert" aria-hidden="true">!</span><span><strong>{overview.alerts}</strong><small>Alertas abiertas</small></span></div>
        </div>
      </section> : null}
      {contentStatus === 'error' ? <section className="panel-message error-text"><p>{contentError?.type === 'session' ? 'No fue posible cargar el reporte de fraude.' : 'No fue posible cargar esta información.'}</p><button className="text-button" type="button" onClick={() => contentError?.type === 'session' ? openSession(contentError.id) : selectedCourse ? loadSessions() : loadCourses()}>Reintentar</button></section> : null}
      {contentStatus !== 'error' && showBiometricProfiles ? <BiometricProfileList filters={biometricFilters} loading={contentStatus === 'loading'} onBack={() => setShowBiometricProfiles(false)} onFiltersChange={changeBiometricFilters} onReset={resetListedBiometricProfile} onRetry={() => loadBiometricProfiles()} pagination={biometricPagination} profiles={biometricProfiles} /> : null}
      {contentStatus !== 'error' && !showBiometricProfiles && selectedSession ? <PanelSessionDetail canManageBiometrics={profile.scope === 'institutional'} onBack={() => setSelectedSession(null)} onEvidence={openEvidence} onResetBiometrics={resetBiometrics} onReview={reviewAlert} session={selectedSession} /> : null}
      {contentStatus !== 'error' && !showBiometricProfiles && selectedCourse && !selectedSession ? <AttemptList course={selectedCourse} filters={attemptFilters} loading={contentStatus === 'loading'} pagination={attemptPagination} sessions={sessions} onBack={() => setSelectedCourse(null)} onExport={exportCourseReport} onFiltersChange={changeAttemptFilters} onOpen={openSession} onRetry={() => loadSessions()} /> : null}
      {contentStatus !== 'error' && !showBiometricProfiles && !selectedCourse ? <CourseList courses={courses} filters={courseFilters} loading={contentStatus === 'loading'} pagination={coursePagination} onFiltersChange={changeCourseFilters} onOpen={openCourse} onRetry={() => loadCourses()} /> : null}
      {dialog ? <PanelDialog
        title={dialog.title}
        description={dialog.description}
        confirmLabel={dialog.type === 'review-alert' ? 'Guardar revisión' : 'Confirmar'}
        onConfirm={confirmDialog}
        onCancel={closeDialog}
        busy={dialog.pending}
      >
        {dialog.type === 'review-alert' ? <label className="dialog-field">Nota de revisión (opcional)<textarea className="resize-none" value={dialog.note ?? ''} onChange={(event) => setDialog((current) => ({ ...current, note: event.target.value }))} rows="4" /></label> : null}
      </PanelDialog> : null}
    </div>
  );
}

function handleRequestError(error, setAuthStatus, setContentStatus) {
  if (error.status === 401) {
    setAuthStatus('unauthorized');
    return;
  }
  if (error.status === 404) {
    setContentStatus('error');
    return;
  }
  setAuthStatus((current) => current === 'loading' ? 'error' : current);
  setContentStatus('error');
}
