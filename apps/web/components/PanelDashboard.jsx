'use client';

import { useEffect, useState } from 'react';

export default function PanelDashboard({ apiUrl, moodleLoginUrl }) {
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('loading');

  async function loadSessions() {
    setStatus('loading');
    const response = await fetch(`${apiUrl}/v1/panel/sessions`, { credentials: 'include' });
    if (response.status === 401) {
      setStatus('unauthorized');
      return;
    }
    if (!response.ok) {
      setStatus('error');
      return;
    }
    const payload = await response.json();
    setSessions(payload.sessions);
    setStatus('ready');
  }

  async function selectSession(id) {
    const response = await fetch(`${apiUrl}/v1/panel/sessions/${id}`, { credentials: 'include' });
    if (response.ok) {
      const payload = await response.json();
      setSelected(payload.session);
    }
  }

  async function reviewAlert(alertId, reviewStatus) {
    const note = window.prompt('Nota de revisión (opcional)', '') ?? '';
    const response = await fetch(`${apiUrl}/v1/panel/alerts/${alertId}/review`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: reviewStatus, note })
    });
    if (response.ok && selected) {
      await selectSession(selected.id);
      await loadSessions();
    }
  }

  async function openEvidence(evidenceId) {
    const response = await fetch(`${apiUrl}/v1/panel/evidence/${evidenceId}/access`, {
      method: 'POST',
      credentials: 'include'
    });
    if (response.ok) {
      const payload = await response.json();
      window.open(payload.url, '_blank', 'noopener,noreferrer');
    }
  }

  useEffect(() => {
    loadSessions().catch(() => setStatus('error'));
  }, []);

  if (status === 'loading') {
    return <p className="panel-message">Cargando sesiones…</p>;
  }
  if (status === 'unauthorized') {
    return (
      <section className="panel-message panel-login" aria-labelledby="panel-login-title">
        <h2 id="panel-login-title">Acceso al panel</h2>
        {moodleLoginUrl ? (
          <>
            <p>Ingresá con tu cuenta docente o de gestor de Moodle para consultar las incidencias autorizadas.</p>
            <a className="button" href={moodleLoginUrl}>Ingresar con Moodle</a>
          </>
        ) : (
          <p className="error-text">El acceso con Moodle no está configurado.</p>
        )}
      </section>
    );
  }
  if (status === 'error') {
    return <p className="panel-message error-text">No fue posible consultar el servicio.</p>;
  }
  if (sessions.length === 0) {
    return <p className="panel-message">No hay sesiones en los cursos autorizados.</p>;
  }

  return (
    <div className="panel-grid">
      <section className="panel-list" aria-label="Sesiones autorizadas">
        {sessions.map((session) => (
          <button className="session-row" key={session.id} onClick={() => selectSession(session.id)}>
            <span><strong>Intento {session.attemptId}</strong><small>Curso {session.courseId} · {session.deviceMode}</small></span>
            <span className={session.openAlertCount > 0 ? 'badge warning' : 'badge'}>{session.openAlertCount} abiertas</span>
          </button>
        ))}
      </section>
      <SessionDetail session={selected} onReview={reviewAlert} onEvidence={openEvidence} />
    </div>
  );
}

function SessionDetail({ session, onReview, onEvidence }) {
  if (!session) {
    return <section className="panel-detail"><p>Selecciona una sesión para revisar su cronología.</p></section>;
  }
  const incidentEvidence = session.evidence.filter((item) => item.kind === 'alert');

  return (
    <section className="panel-detail">
      <p className="eyebrow">Intento {session.attemptId}</p>
      <h2>Curso {session.courseId}</h2>
      <p>Estado: {session.status} · Modalidad: {session.deviceMode}</p>
      <h3>Alertas</h3>
      {session.alerts.length === 0 ? <p>Sin alertas.</p> : session.alerts.map((alert) => (
        <article className="timeline-item" key={alert.id}>
          <strong>{alert.type}</strong>
          <span className={`badge ${alert.severity === 'high' ? 'warning' : ''}`}>{alert.severity}</span>
          <p>Estado: {alert.status}{alert.review_note ? ` · ${alert.review_note}` : ''}</p>
          {alert.status === 'open' && (
            <div className="button-row">
              <button className="text-button" onClick={() => onReview(alert.id, 'reviewed')}>Marcar revisada</button>
              <button className="text-button" onClick={() => onReview(alert.id, 'dismissed')}>Descartar</button>
            </div>
          )}
        </article>
      ))}
      <h3>Imágenes de incidencias</h3>
      {incidentEvidence.length === 0 ? <p>No hay imágenes asociadas a incidencias.</p> : incidentEvidence.map((item) => (
        <button className="text-button evidence-link" key={item.id} onClick={() => onEvidence(item.id)}>
          Ver incidencia · {new Date(item.created_at).toLocaleString()}
        </button>
      ))}
      <h3>Cronología</h3>
      {session.events.map((event) => (
        <article className="timeline-item" key={event.id}>
          <strong>{event.type}</strong>
          <p>{new Date(event.occurred_at).toLocaleString()}</p>
        </article>
      ))}
    </section>
  );
}
