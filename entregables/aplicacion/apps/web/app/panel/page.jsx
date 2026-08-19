import PanelDashboard from '../../components/PanelDashboard.jsx';

export const metadata = {
  title: 'Revisión de proctoring'
};

export default function PanelPage() {
  return (
    <main className="panel-shell">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Proctoring UDS</p>
          <h1>Revisión de sesiones</h1>
          <p>Las alertas requieren revisión humana y no modifican calificaciones.</p>
        </div>
      </header>
      <PanelDashboard apiUrl={process.env.NEXT_PUBLIC_PROCTORING_API_URL ?? 'http://localhost:3001'} />
    </main>
  );
}
