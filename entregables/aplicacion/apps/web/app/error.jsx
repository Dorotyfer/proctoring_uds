'use client';

export default function ErrorPage({ reset }) {
  return (
    <main className="shell">
      <section className="card">
        <h1>No se pudo abrir la sesión</h1>
        <p>Comprueba la conexión e inténtalo nuevamente desde Moodle.</p>
        <button className="button" onClick={reset} type="button">Reintentar</button>
      </section>
    </main>
  );
}
