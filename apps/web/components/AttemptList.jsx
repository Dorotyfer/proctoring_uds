export default function AttemptList({ course, filters, loading, pagination, sessions, onBack, onFiltersChange, onOpen, onRetry }) {
  function update(name, value) {
    onFiltersChange({ ...filters, [name]: value, page: 1 });
  }

  return (
    <section className="panel-content" aria-labelledby="attempts-title">
      <button className="back-button" type="button" onClick={onBack}>← Volver a cursos</button>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Curso</p>
          <h2 id="attempts-title">{course.name || `Curso ${course.id}`}</h2>
        </div>
        <span>{pagination.total ?? 0} intentos</span>
      </div>
      <div className="attempt-filters">
        <label>Buscar<input value={filters.query} onChange={(event) => update('query', event.target.value)} placeholder="Estudiante, documento o cuestionario" /></label>
        <label>Estado<select value={filters.status} onChange={(event) => update('status', event.target.value)}><option value="all">Todos</option><option value="pending">Pendiente</option><option value="active">Activo</option><option value="completed">Completado</option><option value="expired">Expirado</option></select></label>
        <label>Alertas<select value={filters.alerts} onChange={(event) => update('alerts', event.target.value)}><option value="all">Todas</option><option value="open">Abiertas</option><option value="any">Con alertas</option><option value="none">Sin alertas</option></select></label>
        <label>Desde<input type="date" value={filters.dateFrom} onChange={(event) => update('dateFrom', event.target.value)} /></label>
        <label>Hasta<input type="date" value={filters.dateTo} onChange={(event) => update('dateTo', event.target.value)} /></label>
      </div>
      {loading ? <p className="panel-state">Cargando intentos…</p> : null}
      {!loading && sessions.length === 0 ? <div className="panel-state"><p>No hay intentos que coincidan con los filtros.</p><button className="text-button" type="button" onClick={onRetry}>Actualizar</button></div> : null}
      <div className="attempt-list">
        {sessions.map((session) => (
          <button className="attempt-row" key={session.id} type="button" onClick={() => onOpen(session.id)}>
            <span><strong>{session.studentName || 'Estudiante no informado'}</strong><small>{session.studentDocumentLast4 || 'Documento no informado'} · {session.quizName || `Cuestionario ${session.quizId}`}</small></span>
            <span><small>{formatDate(session.createdAt)} · {session.deviceMode} · Nivel {controlLevelLabel(session.controlLevel)}</small><span className={session.openAlertCount > 0 ? 'badge warning' : 'badge'}>{session.openAlertCount} abiertas</span><span className="badge">{riskSummaryLabel(session.riskCategory)}</span></span>
          </button>
        ))}
      </div>
      <div className="pagination" aria-label="Paginación de intentos">
        <button type="button" disabled={filters.page <= 1 || loading} onClick={() => onFiltersChange({ ...filters, page: filters.page - 1 })}>Anterior</button>
        <span>Página {filters.page} de {Math.max(pagination.totalPages ?? 0, 1)}</span>
        <button type="button" disabled={filters.page >= (pagination.totalPages ?? 0) || loading} onClick={() => onFiltersChange({ ...filters, page: filters.page + 1 })}>Siguiente</button>
      </div>
    </section>
  );
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : 'Fecha no informada';
}

function controlLevelLabel(level) {
  if (level === 'low') return 'Bajo';
  if (level === 'high') return 'Alto';
  return 'Medio';
}

function riskSummaryLabel(category) {
  if (category === 'high_risk') return 'Riesgo alto';
  if (category === 'medium_risk') return 'Riesgo medio';
  if (category === 'observation') return 'Observación';
  return 'Normal';
}
