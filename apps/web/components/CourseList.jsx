export default function CourseList({ courses, filters, loading, pagination, onFiltersChange, onOpen, onRetry }) {
  function submit(event) {
    event.preventDefault();
    onFiltersChange({ ...filters, page: 1 });
  }

  return (
    <section className="panel-content" aria-labelledby="courses-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Cursos autorizados</p>
          <h2 id="courses-title">Seleccioná un curso</h2>
        </div>
      </div>
      <form className="panel-toolbar" onSubmit={submit}>
        <label>
          Buscar curso
          <input value={filters.query} onChange={(event) => onFiltersChange({ ...filters, query: event.target.value, page: 1 })} />
        </label>
        <button className="button" type="submit">Buscar</button>
      </form>
      {loading ? <p className="panel-state">Cargando cursos…</p> : null}
      {!loading && courses.length === 0 ? (
        <div className="panel-state">
          <p>{filters.query ? 'No encontramos cursos para esta búsqueda.' : 'No hay cursos con intentos registrados.'}</p>
          <button className="text-button" type="button" onClick={onRetry}>Actualizar</button>
        </div>
      ) : null}
      <div className="course-grid">
        {courses.map((course) => (
          <button className="course-card" key={course.id} type="button" onClick={() => onOpen(course)}>
            <span>
              <strong>{course.name || `Curso ${course.id}`}</strong>
              <small>{course.attemptCount} intentos registrados</small>
            </span>
            <span className={course.openAlertCount > 0 ? 'badge warning' : 'badge'}>
              {course.openAlertCount} alertas abiertas
            </span>
          </button>
        ))}
      </div>
      <div className="pagination" aria-label="Paginación de cursos">
        <button type="button" aria-label="Curso anterior" disabled={filters.page <= 1 || loading} onClick={() => onFiltersChange({ ...filters, page: filters.page - 1 })}>Anterior</button>
        <span>Página {filters.page} de {Math.max(pagination.totalPages ?? 0, 1)}</span>
        <button type="button" aria-label="Siguiente curso" disabled={filters.page >= (pagination.totalPages ?? 0) || loading} onClick={() => onFiltersChange({ ...filters, page: filters.page + 1 })}>Siguiente</button>
      </div>
    </section>
  );
}
