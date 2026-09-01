import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { PreparationFlow } from '@/components/PreparationFlow';
import { activateSession, getSession } from '@/lib/session-api';

vi.mock('@/components/BiometricConsent', () => ({
  BiometricConsent: ({ onAccept }) => <button onClick={onAccept}>Aceptar consentimiento</button>
}));
vi.mock('@/components/CameraCheck', () => ({
  CameraCheck: ({ onReady, totalSteps }) => <button onClick={() => onReady({ id: 'stream' })}>Cámara de {totalSteps} pasos</button>
}));
vi.mock('@/components/EnrollmentCheck', () => ({
  EnrollmentCheck: ({ onComplete, totalSteps }) => (
    <button onClick={() => onComplete({ biometricSamples: [[1], [1], [1]], referenceCapture: 'reference' })}>
      Rostro de {totalSteps} pasos
    </button>
  )
}));
vi.mock('@/components/LivenessCheck', () => ({
  LivenessCheck: ({ onComplete, totalSteps }) => <button onClick={onComplete}>Vida de {totalSteps} pasos</button>
}));
vi.mock('@/components/IdentityDocumentCapture', () => ({
  IdentityDocumentCapture: ({ onConfirm }) => <button onClick={() => onConfirm('document-photo')}>Confirmar documento</button>
}));
vi.mock('@/components/SessionMonitor', () => ({ SessionMonitor: () => null }));
vi.mock('@/lib/camera', () => ({ stopCamera: vi.fn() }));
vi.mock('@/lib/face-analysis', () => ({ createLivenessChallenge: () => ['blink', 'turn-left'] }));
vi.mock('@/lib/human', () => ({ createHumanDetector: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/incident-buffer', () => ({
  createIncidentBuffer: () => ({ flush: vi.fn().mockResolvedValue(undefined) })
}));
vi.mock('@/lib/incident-delivery', () => ({ deliverIncident: vi.fn() }));
vi.mock('@/lib/incident-payload', () => ({ createIncident: vi.fn() }));
vi.mock('@/lib/session-api', () => ({
  activateSession: vi.fn(),
  getSession: vi.fn(),
  readSessionId: () => 'session-1',
  sendIncident: vi.fn(),
  sendSessionEvent: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  activateSession.mockResolvedValue({ biometric: { status: 'enrolled' }, session: { status: 'active' } });
});

it('adds the document step only when the server requires enrollment evidence', async () => {
  getSession.mockResolvedValue({
    session: {
      biometric: { state: 'unregistered' },
      identityDocumentRequired: true,
      status: 'pending'
    }
  });

  render(<PreparationFlow monitorMode={false} returnUrl={null} token="token" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Aceptar consentimiento' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cámara de 4 pasos' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Rostro de 4 pasos' }));
  fireEvent.click(screen.getByRole('button', { name: 'Vida de 4 pasos' }));

  expect(screen.getByRole('button', { name: 'Confirmar documento' })).toBeInTheDocument();
  expect(activateSession).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar documento' }));

  await waitFor(() => expect(activateSession).toHaveBeenCalledWith('token', expect.objectContaining({
    documentCapture: 'document-photo'
  })));
});

it('keeps the existing three-step flow for an enrolled profile', async () => {
  getSession.mockResolvedValue({
    session: {
      biometric: { state: 'enrolled' },
      identityDocumentRequired: false,
      status: 'pending'
    }
  });

  render(<PreparationFlow monitorMode={false} returnUrl={null} token="token" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cámara de 3 pasos' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Rostro de 3 pasos' }));
  fireEvent.click(screen.getByRole('button', { name: 'Vida de 3 pasos' }));

  await waitFor(() => expect(activateSession).toHaveBeenCalledWith('token', expect.objectContaining({
    documentCapture: undefined
  })));
  expect(screen.queryByRole('button', { name: 'Confirmar documento' })).not.toBeInTheDocument();
});
