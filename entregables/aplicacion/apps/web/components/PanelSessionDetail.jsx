export default function PanelSessionDetail({ session, onBack, onEvidence, onReview }) {
  const incidentEvidence = session.evidence.filter((item) => item.kind === 'alert');

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
      </dl>
      <h3>Alertas</h3>
      {session.alerts.length === 0 ? <p>Sin alertas.</p> : session.alerts.map((alert) => (
        <article className="timeline-item" key={alert.id}>
          <strong>{alert.type}</strong>
          <span className={`badge ${alert.severity === 'high' ? 'warning' : ''}`}>{alert.severity}</span>
          <p>Estado: {alert.status}{alert.review_note ? ` · ${alert.review_note}` : ''}</p>
          {alert.status === 'open' ? <div className="button-row"><button className="text-button" type="button" onClick={() => onReview(alert.id, 'reviewed')}>Marcar revisada</button><button className="text-button" type="button" onClick={() => onReview(alert.id, 'dismissed')}>Descartar</button></div> : null}
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
