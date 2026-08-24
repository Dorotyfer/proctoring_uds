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
      {session.risk ? <BehaviorAnalysis risk={session.risk} /> : null}
      <h3>Alertas</h3>
      {session.alerts.length === 0 ? <p>Sin alertas.</p> : <div className="alert-table-wrap">
        <table className="alert-table">
          <thead>
            <tr><th scope="col">Alerta</th><th scope="col">Severidad</th><th scope="col">Revisión</th><th scope="col">Evidencia</th><th scope="col">Acciones</th></tr>
          </thead>
          <tbody>
            {session.alerts.map((alert) => <tr key={alert.id}>
              <td data-label="Alerta"><strong>{alertTypeLabel(alert.type)}</strong></td>
              <td data-label="Severidad"><span className={`badge ${alert.severity === 'high' ? 'warning' : ''}`}>{alert.severity}</span></td>
              <td data-label="Revisión"><span className="badge">{reviewStatusLabel(alert.status)}</span>{alert.review_note ? <small>{alert.review_note}</small> : null}</td>
              <td data-label="Evidencia">{alert.evidenceId ? <button className="text-button" type="button" onClick={() => onEvidence(alert.evidenceId)}>Ver imagen de la incidencia</button> : alert.captureStatus === 'unavailable' ? <span className="muted-label">Sin imagen disponible.</span> : <span className="muted-label">Imagen pendiente de guardar.</span>}</td>
              <td data-label="Acciones">{alert.status === 'open' ? <div className="button-row"><button className="text-button" type="button" onClick={() => onReview(alert.id, 'reviewed')}>Válida</button><button className="text-button" type="button" onClick={() => onReview(alert.id, 'dismissed')}>Inválida</button></div> : <span className="muted-label">Sin acciones</span>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
      <h3>Imágenes de incidencias</h3>
      {incidentEvidence.length === 0 ? <p>No hay imágenes asociadas a incidencias.</p> : incidentEvidence.map((item) => (
        <button className="text-button evidence-link" type="button" key={item.id} onClick={() => onEvidence(item.id)}>Ver incidencia · {new Date(item.created_at).toLocaleString()}</button>
      ))}
      <section className="event-timeline" aria-label="Cronología de eventos">
        <h3>Cronología</h3>
        {session.events.map((event) => <article className="timeline-item" key={event.id}><strong>{alertTypeLabel(event.type)}</strong>{event.type === 'attention_signal' ? <p>{attentionSignalLabel(event.metadata)}</p> : null}<p>{new Date(event.occurred_at).toLocaleString()}</p></article>)}
      </section>
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
  if (type === 'multiple_faces') return 'Se detectaron múltiples rostros';
  if (type === 'liveness_check_failed') return 'Falló la prueba de vida';
  if (type === 'identity_check_failed') return 'Falló la verificación de identidad';
  if (type === 'camera_interrupted') return 'Cámara interrumpida';
  if (type === 'page_visibility_changed') return 'Cambio de visibilidad de la página';
  if (type === 'network_disconnected') return 'Desconexión de red';
  if (type === 'face_absent') return 'Rostro ausente';
  if (type === 'face_out_of_frame') return 'Rostro fuera de encuadre';
  if (type === 'seb_event') return 'Evento sospechoso de Safe Exam Browser';
  if (type === 'attention_signal') return 'Observación de expresión facial';
  return type;
}

function attentionSignalLabel(metadata = {}) {
  const expression = typeof metadata.expression === 'string' ? metadata.expression : 'no determinada';
  const confidence = Number.isFinite(metadata.confidence) ? ` · confianza ${Math.round(metadata.confidence * 100)}%` : '';
  return `Expresión observada: ${expression}${confidence}`;
}

function BehaviorAnalysis({ risk }) {
  const score = Math.max(0, Math.min(Number(risk.score) || 0, 100));

  return (
    <section className="behavior-analysis" aria-labelledby="behavior-analysis-title">
      <h3 id="behavior-analysis-title">Análisis de comportamiento</h3>
      <div className="risk-overview">
        <RiskScore score={score} category={risk.category} />
        <div>
          <p><strong>{riskCategoryLabel(risk.category)}</strong></p>
          <p><span>Nivel de control: {controlLevelLabel(risk.controlLevel)}</span> · <span>Puntaje: {score}/100</span></p>
          <p className="risk-description">El puntaje resume las señales observadas durante el intento.</p>
        </div>
      </div>
      <section aria-label="Señales detectadas" className="risk-signals">
        <h4>Señales detectadas</h4>
        {risk.reasons?.length ? risk.reasons.map((reason) => <div className="risk-signal" key={reason.code}>
          <div><strong>{reason.label || alertTypeLabel(reason.code)}</strong><span>{reason.count} evento(s) · {reason.points} puntos</span></div>
          <div className="risk-bar" aria-label={`${reason.label || alertTypeLabel(reason.code)}: ${reason.points} puntos`}><span style={{ width: `${Math.min(reason.points / 35 * 100, 100)}%` }} /></div>
        </div>) : <p>Sin señales relevantes detectadas.</p>}
      </section>
      <p>El análisis es orientativo y requiere revisión humana.</p>
    </section>
  );
}

function RiskScore({ score, category }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className={`risk-score risk-score-${category}`}>
      <svg role="img" aria-label={`Puntaje de riesgo: ${score} sobre 100`} viewBox="0 0 100 100">
        <circle className="risk-score-track" cx="50" cy="50" r={radius} />
        <circle className="risk-score-value" cx="50" cy="50" r={radius} strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>
      <strong>{score}</strong>
      <span>/100</span>
    </div>
  );
}

function controlLevelLabel(level) {
  if (level === 'low') return 'Bajo';
  if (level === 'high') return 'Alto';
  return 'Medio';
}

function riskCategoryLabel(category) {
  if (category === 'high_risk') return 'Riesgo de fraude alto';
  if (category === 'medium_risk') return 'Riesgo de fraude medio';
  if (category === 'observation') return 'Observación';
  return 'Comportamiento normal';
}
