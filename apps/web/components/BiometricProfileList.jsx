import { formatDateTime } from '@/lib/localization';

export default function BiometricProfileList({ profiles, filters, loading, pagination, onBack, onFiltersChange, onReset, onRetry }) {
  function submit(event) {
    event.preventDefault();
    onFiltersChange({ ...filters, page: 1 });
  }

  return (
    <section className="panel-content" aria-labelledby="biometric-profiles-title">
      <button className="back-button" type="button" onClick={onBack}>← Volver al panel</button>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Administración</p>
          <h2 id="biometric-profiles-title">Perfiles biométricos</h2>
        </div>
        <span>{pagination.total ?? 0} perfiles</span>
      </div>
      <form className="panel-toolbar" onSubmit={submit}>
        <label>
          Buscar usuario
          <input value={filters.query} onChange={(event) => onFiltersChange({ ...filters, query: event.target.value, page: 1 })} />
        </label>
        <button className="button" type="submit">Buscar</button>
      </form>
      {loading ? <p className="panel-state">Cargando perfiles…</p> : null}
      {!loading && profiles.length === 0 ? <div className="panel-state"><p>No hay perfiles biométricos registrados.</p><button className="text-button" type="button" onClick={onRetry}>Actualizar</button></div> : null}
      {profiles.length > 0 ? (
        <div className="profile-table-wrap">
          <table className="profile-table">
            <thead>
              <tr><th>Nombre</th><th>CI</th><th>Usuario Moodle</th><th>Estado</th><th>Versión</th><th>Registrado</th><th>Última verificación</th><th>Acción</th></tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.moodleUserId}>
                  <td>{profile.studentName || 'No informado'}</td>
                  <td>{profile.studentDocument || 'No informado'}</td>
                  <td>{profile.moodleUserId}</td>
                  <td><span className={profile.status === 'active' ? 'badge' : 'badge warning'}>{profile.status === 'active' ? 'Registrado' : 'Revocado'}</span></td>
                  <td>{profile.enrollmentVersion}</td>
                  <td>{formatDate(profile.enrolledAt)}</td>
                  <td>{formatDate(profile.lastVerifiedAt)}</td>
                  <td>{profile.status === 'active' ? <button className="text-button" type="button" onClick={() => onReset(profile.moodleUserId)}>Revocar</button> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="pagination" aria-label="Paginación de perfiles biométricos">
        <button type="button" disabled={filters.page <= 1 || loading} onClick={() => onFiltersChange({ ...filters, page: filters.page - 1 })}>Anterior</button>
        <span>Página {filters.page} de {Math.max(pagination.totalPages ?? 0, 1)}</span>
        <button type="button" disabled={filters.page >= (pagination.totalPages ?? 0) || loading} onClick={() => onFiltersChange({ ...filters, page: filters.page + 1 })}>Siguiente</button>
      </div>
    </section>
  );
}

function formatDate(value) {
  return value ? formatDateTime(value) : 'Nunca';
}
