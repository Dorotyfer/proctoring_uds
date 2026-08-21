'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { createPanelApi } from '../lib/panel-api.js';
import AttemptList from './AttemptList.jsx';
import CourseList from './CourseList.jsx';
import PanelSessionDetail from './PanelSessionDetail.jsx';

const initialCourseFilters = { page: 1, pageSize: 25, query: '' };
const initialAttemptFilters = { alerts: 'all', dateFrom: '', dateTo: '', page: 1, pageSize: 25, query: '', status: 'all' };

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

  const loadCourses = useCallback(async (filters = courseFilters) => {
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

  async function openCourse(course) {
    setSelectedCourse(course);
    setSelectedSession(null);
    await loadSessions(course, attemptFilters);
  }

  async function openSession(sessionId) {
    setContentStatus('loading');
    try {
      const payload = await api.getSession(sessionId);
      setSelectedSession(payload.session);
      setContentStatus('ready');
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

  async function reviewAlert(alertId, reviewStatus) {
    const note = window.prompt('Nota de revisión (opcional)', '') ?? '';
    try {
      await api.reviewAlert(alertId, reviewStatus, note);
      await openSession(selectedSession.id);
      await loadSessions(selectedCourse, attemptFilters);
    } catch (error) {
      handleRequestError(error, setAuthStatus, setContentStatus);
    }
  }

  async function openEvidence(evidenceId) {
    try {
      const payload = await api.accessEvidence(evidenceId);
      window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
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
        <div><strong>{profile.displayName}</strong><span>{profile.scope === 'institutional' ? 'Acceso institucional' : 'Acceso a cursos asignados'}</span></div>
        <button className="text-button" type="button" onClick={logout}>Cerrar sesión</button>
      </header>
      {contentStatus === 'error' ? <section className="panel-message error-text"><p>No fue posible cargar esta información.</p><button className="text-button" type="button" onClick={() => selectedCourse ? loadSessions() : loadCourses()}>Reintentar</button></section> : null}
      {contentStatus !== 'error' && selectedSession ? <PanelSessionDetail session={selectedSession} onBack={() => setSelectedSession(null)} onEvidence={openEvidence} onReview={reviewAlert} /> : null}
      {contentStatus !== 'error' && selectedCourse && !selectedSession ? <AttemptList course={selectedCourse} filters={attemptFilters} loading={contentStatus === 'loading'} pagination={attemptPagination} sessions={sessions} onBack={() => setSelectedCourse(null)} onFiltersChange={changeAttemptFilters} onOpen={openSession} onRetry={() => loadSessions()} /> : null}
      {contentStatus !== 'error' && !selectedCourse ? <CourseList courses={courses} filters={courseFilters} loading={contentStatus === 'loading'} pagination={coursePagination} onFiltersChange={changeCourseFilters} onOpen={openCourse} onRetry={() => loadCourses()} /> : null}
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
