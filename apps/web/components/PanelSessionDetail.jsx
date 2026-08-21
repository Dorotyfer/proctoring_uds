export default function PanelSessionDetail({ canManageBiometrics, session, onBack, onEvidence, onResetBiometrics, onReview }) {
  const incidentEvidence = session.evidence.filter((item) => item.kind === 'alert' &&
    !session.alerts.some((alert) => alert.evidenceId === item.id));

  return (
    <section className="panel-content panel-detail" aria-labelledby="session-title">
      <button className="back-button" type="button" onClick={onBack}>← Volver a intentos</button>
      <p className="eyebrow">Intento {session.attemptId}</p>
      <h2 id="session-title">{session.studentName || 'Estudiante no informado'}</h2>
      <dl className="detail-summary">
        <div><dt>Documento</dt><dd>{session.studentDocument || 'No informado'}</dd></div>
        <div><dt>Cuestionario</dt><dd>{session.quizName || `Cuestionario ${session.quizId}`}</dd></div>
        <div><dt>Estado</dt><dd>{session.status}</dd></div>
        <div><dt>Modalidad</dt><dd>{session.deviceMode}</dd></div>
        <div><dt>Biometría</dt><dd>{biometricStatusLabel(session.biometric?.status)}</dd></div>
      </dl>
      {canManageBiometrics && session.moodleUserId ? (
        <button className="text-button" type="button" onClick={() => onResetBiometrics(session.moodleUserId)}>
          Exigir nueva inscripción biométrica
        </button>
      ) : null}
      <h3>Alertas</h3>
      {session.alerts.length === 0 ? <p>Sin alertas.</p> : session.alerts.map((alert) => (
        <article className="timeline-item" key={alert.id}>
          <strong>{alertTypeLabel(alert.type)}</strong>
          <span className={`badge ${alert.severity === 'high' ? 'warning' : ''}`}>{alert.severity}</span>
          <p>Estado: {reviewStatusLabel(alert.status)}{alert.review_note ? ` · ${alert.review_note}` : ''}</p>
          {alert.evidenceId ? <button className="text-button evidence-link" type="button" onClick={() => onEvidence(alert.evidenceId)}>Ver imagen de la incidencia</button> : alert.captureStatus === 'unavailable' ? <p>Sin imagen disponible.</p> : <p>Imagen pendiente de guardar.</p>}
          {alert.status === 'open' ? <div className="button-row"><button className="text-button" type="button" onClick={() => onReview(alert.id, 'reviewed')}>Válida</button><button className="text-button" type="button" onClick={() => onReview(alert.id, 'dismissed')}>Inválida</button></div> : null}
        </article>
      ))}
      <h3>Imágenes de incidencias</h3>
      {incidentEvidence.length === 0 ? <p>No hay imágenes asociadas a incidencias.</p> : incidentEvidence.map((item) => (
        <button className="text-button evidence-link" type="button" key={item.id} onClick={() => onEvidence(item.id)}>Ver incidencia · {new Date(item.created_at).toLocaleString()}</button>
      ))}
      <h3>Cronología</h3>
      {session.events.map((event) => <article className="timeline-item" key={event.id}><strong>{event.type}</strong><p>{new Date(event.occurred_at).toLocaleString()}</p></article>)}
    </section>
  );
}

function reviewStatusLabel(status) {
  if (status === 'reviewed') return 'Válida';
  if (status === 'dismissed') return 'Inválida';
  return 'Pendiente';
}

function biometricStatusLabel(status) {
  if (status === 'enrolled') return 'Registrada';
  if (status === 'matched') return 'Coincidente';
  if (status === 'mismatch') return 'No coincidente';
  if (status === 'revoked') return 'Reinscripción requerida';
  return 'No registrada';
}

function alertTypeLabel(type) {
  if (type === 'biometric_mismatch') return 'Identidad biométrica no coincidente';
  return type;
}
