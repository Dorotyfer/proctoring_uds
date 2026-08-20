import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import PanelDashboard from '@/components/PanelDashboard';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('offers Moodle sign-in when the panel session is missing', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

  render(
    <PanelDashboard
      apiUrl="https://api.test"
      moodleLoginUrl="https://moodle.test/local/proctoring/report.php"
    />
  );

  const link = await screen.findByRole('link', { name: 'Ingresar con Moodle' });
  expect(link).toHaveAttribute('href', 'https://moodle.test/local/proctoring/report.php');
});

it('reports missing Moodle SSO configuration without linking to localhost', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

  render(<PanelDashboard apiUrl="https://api.test" moodleLoginUrl={null} />);

  expect(await screen.findByText('El acceso con Moodle no está configurado.')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Ingresar con Moodle' })).not.toBeInTheDocument();
});

it('renders only evidence marked as an incident', async () => {
  const requests = [
    response({ sessions: [{ id: 'session-1', attemptId: '15', courseId: '7', deviceMode: 'browser', openAlertCount: 1 }] }),
    response({
      session: {
        id: 'session-1',
        attemptId: '15',
        courseId: '7',
        status: 'active',
        deviceMode: 'browser',
        alerts: [],
        events: [],
        evidence: [
          { id: 'interval-1', kind: 'interval', created_at: '2026-08-20T20:00:00.000Z' },
          { id: 'alert-1', kind: 'alert', created_at: '2026-08-20T20:01:00.000Z' }
        ]
      }
    })
  ];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(requests.shift())));

  render(<PanelDashboard apiUrl="https://api.test" moodleLoginUrl="https://moodle.test/report.php" />);
  fireEvent.click(await screen.findByRole('button', { name: /Intento 15/ }));

  await waitFor(() => expect(screen.getByRole('button', { name: /Ver incidencia/ })).toBeInTheDocument());
  expect(screen.queryByText(/interval/)).not.toBeInTheDocument();
});

function response(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    }
  };
}
