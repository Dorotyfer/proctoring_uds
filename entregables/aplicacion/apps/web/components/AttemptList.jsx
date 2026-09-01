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
      <div className="attempt-table-wrap">
        <table className="attempt-table">
          <thead>
            <tr>
              <th scope="col">Estudiante</th>
              <th scope="col">Cuestionario</th>
              <th scope="col">Fecha</th>
              <th scope="col">Modalidad</th>
              <th scope="col">Nivel de control</th>
              <th scope="col">Riesgo</th>
              <th scope="col">Alertas</th>
              <th scope="col"><span className="visually-hidden">Acción</span></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td data-label="Estudiante">
                  <button className="attempt-open" type="button" onClick={() => onOpen(session.id)}>
                    <strong>{session.studentName || 'Estudiante no informado'}</strong>
                    <small>{session.studentDocumentLast4 || 'Documento no informado'}</small>
                  </button>
                </td>
                <td data-label="Cuestionario">{session.quizName || `Cuestionario ${session.quizId}`}</td>
                <td data-label="Fecha">{formatDate(session.createdAt)}</td>
                <td data-label="Modalidad">{session.deviceMode}</td>
                <td data-label="Nivel de control"><span className="badge">{controlLevelLabel(session.controlLevel)}</span></td>
                <td data-label="Riesgo"><span className="badge">{riskSummaryLabel(session.riskCategory)}{session.riskScore != null ? ` · ${session.riskScore}/100` : ''}</span></td>
                <td data-label="Alertas"><span className={session.openAlertCount > 0 ? 'badge warning' : 'badge'}>{session.openAlertCount} abiertas</span></td>
                <td data-label="Acción"><button className="text-button report-button" type="button" onClick={() => onOpen(session.id)}>Ver reporte de fraude</button></td>
              </tr>
            ))}
          </tbody>
        </table>
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
