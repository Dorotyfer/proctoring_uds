import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import PanelDashboard from '@/components/PanelDashboard';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('instructs an expired user to enter from Moodle without offering local credentials', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
  render(<PanelDashboard apiUrl="https://api.test" moodleReturnUrl="https://moodle.test" />);

  expect(await screen.findByText('Ingresá desde Moodle para acceder al panel.')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: /usuario/i })).not.toBeInTheDocument();
});

it('shows the Moodle profile and only the courses returned by the scoped API', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(response({ user: profile }))
    .mockResolvedValueOnce(response({
      courses: [{ id: '7', name: 'Derecho', attemptCount: 3, openAlertCount: 1 }],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1
    })));

  render(<PanelDashboard apiUrl="https://api.test" moodleReturnUrl="https://moodle.test" />);

  expect(await screen.findByText('Persona revisora')).toBeInTheDocument();
  expect(screen.getByText('Acceso institucional')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Derecho/ })).toBeInTheDocument();
  expect(screen.getByText(/Código: 7/)).toBeInTheDocument();
});

it('paginates the course catalog for institutional users', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(response({ user: profile }))
    .mockResolvedValueOnce(response({ courses: [{ id: '7', name: 'Derecho', attemptCount: 3, openAlertCount: 1 }], total: 2, totalPages: 2 }))
    .mockResolvedValueOnce(response({ courses: [{ id: '8', name: 'Medicina', attemptCount: 4, openAlertCount: 0 }], total: 2, totalPages: 2 })));

  render(<PanelDashboard apiUrl="https://api.test" moodleReturnUrl="https://moodle.test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Siguiente curso' }));

  expect(await screen.findByRole('button', { name: /Medicina/ })).toBeInTheDocument();
});

it('opens the biometric profiles section for institutional users', async () => {
  const requests = [
    response({ user: profile }),
    response({ courses: [], total: 0, totalPages: 0 }),
    response({
      profiles: [{
        enrolledAt: '2026-08-24T12:00:00.000Z',
        enrollmentVersion: 2,
        lastVerifiedAt: null,
        moodleUserId: 'student-1',
        revokedAt: null,
        status: 'active',
        studentDocument: '1234567',
        studentName: 'Ana Pérez'
      }],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1
    })
  ];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(requests.shift())));

  render(<PanelDashboard apiUrl="https://api.test" moodleReturnUrl="https://moodle.test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Perfiles biométricos' }));

  expect(await screen.findByText('student-1')).toBeInTheDocument();
  expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
  expect(screen.getByText('1234567')).toBeInTheDocument();
  expect(screen.getAllByText('Registrado').length).toBe(2);
});

it('navigates from a course to attempts and shows the full document only in detail', async () => {
  const requests = [
    response({ user: profile }),
    response({ courses: [{ id: '7', name: 'Derecho', attemptCount: 1, openAlertCount: 1 }], total: 1, totalPages: 1 }),
    response({
      sessions: [{ id: 'session-1', attemptId: '15', studentName: 'Ana Pérez', studentDocumentLast4: '•••4567', quizName: 'Examen final', deviceMode: 'browser', status: 'active', createdAt: '2026-08-20T20:00:00.000Z', openAlertCount: 1 }],
      total: 1,
      totalPages: 1
    }),
    response({
      session: {
        id: 'session-1', attemptId: '15', courseId: '7', studentName: 'Ana Pérez', studentDocument: '1234567', quizName: 'Examen final', status: 'active', deviceMode: 'browser', alerts: [], events: [], evidence: []
      }
    })
  ];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(requests.shift())));

  render(<PanelDashboard apiUrl="https://api.test" moodleReturnUrl="https://moodle.test" />);
  fireEvent.click(await screen.findByRole('button', { name: /Derecho/ }));
  expect(await screen.findByRole('button', { name: /•••4567/ })).toBeInTheDocument();
  expect(screen.queryByText('1234567')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Ana Pérez/ }));
  expect(await screen.findByText('1234567')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Volver a intentos/ }));
  expect(screen.getByRole('button', { name: /•••4567/ })).toBeInTheDocument();
});

it('shows control level and explainable behavior risk for an attempt', async () => {
  const requests = [
    response({ user: profile }),
    response({ courses: [{ id: '7', name: 'Derecho', attemptCount: 1, openAlertCount: 1 }], total: 1, totalPages: 1 }),
    response({ sessions: [{ id: 'session-risk', attemptId: '15', studentName: 'Ana Pérez', studentDocumentLast4: '•••4567', quizName: 'Examen', deviceMode: 'browser', status: 'completed', createdAt: '2026-08-20T20:00:00.000Z', openAlertCount: 1, controlLevel: 'high', riskCategory: 'high_risk', riskScore: 80 }], total: 1, totalPages: 1 }),
    response({
      session: {
        id: 'session-risk', attemptId: '15', courseId: '7', studentName: 'Ana Pérez', studentDocument: '1234567', quizName: 'Examen', status: 'completed', deviceMode: 'browser', controlLevel: 'high',
        risk: { category: 'high_risk', controlLevel: 'high', score: 80, counts: { multiple_faces: 1 }, reasons: [{ code: 'multiple_faces', count: 1, label: 'Se detectaron múltiples rostros', points: 30 }] },
        alerts: [], events: [], evidence: []
      }
    })
  ];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(requests.shift())));

  render(<PanelDashboard apiUrl="https://api.test" moodleReturnUrl="https://moodle.test" />);
  fireEvent.click(await screen.findByRole('button', { name: /Derecho/ }));
  expect(await screen.findByText('Riesgo alto')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ver reporte de fraude' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Ana Pérez/ }));

  expect(await screen.findByText('Riesgo de fraude alto')).toBeInTheDocument();
  expect(screen.getByText('Nivel de control: Alto')).toBeInTheDocument();
  expect(screen.getByText('Puntaje: 80/100')).toBeInTheDocument();
  expect(screen.getByText('Se detectaron múltiples rostros')).toBeInTheDocument();
  expect(screen.getByText(/requiere revisión humana/)).toBeInTheDocument();
});

it('renders only evidence marked as an incident', async () => {
  const requests = [
    response({ user: profile }),
    response({ courses: [{ id: '7', name: 'Derecho', attemptCount: 1, openAlertCount: 1 }], total: 1, totalPages: 1 }),
    response({ sessions: [{ id: 'session-1', attemptId: '15', studentName: 'Ana', studentDocumentLast4: null, quizName: 'Examen', deviceMode: 'browser', status: 'active', createdAt: '2026-08-20T20:00:00.000Z', openAlertCount: 1 }], total: 1, totalPages: 1 }),
    response({
      session: {
        id: 'session-1', attemptId: '15', courseId: '7', status: 'active', deviceMode: 'browser', alerts: [], events: [],
        evidence: [
          { id: 'interval-1', kind: 'interval', created_at: '2026-08-20T20:00:00.000Z' },
          { id: 'alert-1', kind: 'alert', created_at: '2026-08-20T20:01:00.000Z' }
        ]
      }
    })
  ];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(requests.shift())));

  render(<PanelDashboard apiUrl="https://api.test" moodleReturnUrl="https://moodle.test" />);
  fireEvent.click(await screen.findByRole('button', { name: /Derecho/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Ana/ }));

  await waitFor(() => expect(screen.getByRole('button', { name: /Ver incidencia/ })).toBeInTheDocument());
  expect(screen.queryByText(/interval/)).not.toBeInTheDocument();
});

it('shows linked incident evidence with valid and invalid review actions', async () => {
  const requests = [
    response({ user: profile }),
    response({ courses: [{ id: '7', name: 'Derecho', attemptCount: 1, openAlertCount: 1 }], total: 1, totalPages: 1 }),
    response({ sessions: [{ id: 'session-1', attemptId: '15', studentName: 'Ana', studentDocumentLast4: null, quizName: 'Examen', deviceMode: 'browser', status: 'active', createdAt: '2026-08-20T20:00:00.000Z', openAlertCount: 1 }], total: 1, totalPages: 1 }),
    response({
      session: {
        id: 'session-1', attemptId: '15', courseId: '7', status: 'active', deviceMode: 'browser',
        alerts: [{ id: 'alert-1', type: 'biometric_mismatch', severity: 'high', status: 'open', evidenceId: 'evidence-1' }],
        events: [],
        evidence: [{ id: 'evidence-1', kind: 'alert', created_at: '2026-08-20T20:01:00.000Z' }]
      }
    })
  ];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(requests.shift())));

  render(<PanelDashboard apiUrl="https://api.test" moodleReturnUrl="https://moodle.test" />);
  fireEvent.click(await screen.findByRole('button', { name: /Derecho/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Ana/ }));

  expect(await screen.findByRole('button', { name: /Válida/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Inválida/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Ver imagen de la incidencia/ })).toBeInTheDocument();
  expect(screen.getByText('Identidad biométrica no coincidente')).toBeInTheDocument();
});

it('distinguishes an incident without a camera frame from a pending upload', async () => {
  const requests = [
    response({ user: profile }),
    response({ courses: [{ id: '7', name: 'Derecho', attemptCount: 1, openAlertCount: 1 }], total: 1, totalPages: 1 }),
    response({ sessions: [{ id: 'session-1', attemptId: '15', studentName: 'Ana', studentDocumentLast4: null, quizName: 'Examen', deviceMode: 'browser', status: 'active', createdAt: '2026-08-20T20:00:00.000Z', openAlertCount: 1 }], total: 1, totalPages: 1 }),
    response({
      session: {
        id: 'session-1', attemptId: '15', courseId: '7', status: 'active', deviceMode: 'browser',
        alerts: [{ id: 'alert-1', type: 'camera_interrupted', severity: 'high', status: 'open', evidenceId: null, captureStatus: 'unavailable' }],
        events: [], evidence: []
      }
    })
  ];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(requests.shift())));

  render(<PanelDashboard apiUrl="https://api.test" moodleReturnUrl="https://moodle.test" />);
  fireEvent.click(await screen.findByRole('button', { name: /Derecho/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Ana/ }));

  expect(await screen.findByText('Sin imagen disponible.')).toBeInTheDocument();
  expect(screen.queryByText('Imagen pendiente de guardar.')).not.toBeInTheDocument();
});

const profile = {
  moodleUserId: '42',
  displayName: 'Persona revisora',
  scope: 'institutional',
  canReview: true,
  canViewEvidence: true
};

function response(payload) {
  return { ok: true, status: 200, async json() { return payload; } };
}
