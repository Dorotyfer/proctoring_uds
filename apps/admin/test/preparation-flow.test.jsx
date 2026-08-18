import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { PreparationFlow } from '../components/PreparationFlow.jsx';

function createMediaStream() {
  const track = { stop: vi.fn() };
  return {
    getTracks: () => [track],
    track
  };
}

function renderFlow({ getUserMedia, analyze, submitPreparation }) {
  return render(
    <PreparationFlow
      apiUrl="https://proctoring.test"
      sessionId="9f8e7d6c-5b4a-4321-8999-111111111111"
      browserToken="browser-token"
      livenessChallengeId="7a5f8ad7-60a2-4b47-89e7-c813c8f0720d"
      getUserMedia={getUserMedia}
      analyze={analyze}
      submitPreparation={submitPreparation}
      random={() => 0}
      createCaptureId={vi.fn()
        .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
        .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')}
    />
  );
}

describe('PreparationFlow', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('shows a camera permission error when access is denied', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));

    renderFlow({ getUserMedia, analyze: vi.fn(), submitPreparation: vi.fn() });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Activar cámara' }));
    });

    expect(await screen.findByText('Camera access is required.')).toBeInTheDocument();
  });

  test('blocks reference capture when Human detects no face', async () => {
    const stream = createMediaStream();
    const analyze = vi.fn().mockResolvedValue({ face: [] });

    renderFlow({
      getUserMedia: vi.fn().mockResolvedValue(stream),
      analyze,
      submitPreparation: vi.fn()
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Activar cámara' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Analizar encuadre' }));
    });

    expect(await screen.findByText('No face detected.')).toBeInTheDocument();
  });

  test('blocks reference capture when Human detects more than one face', async () => {
    const stream = createMediaStream();
    const analyze = vi.fn().mockResolvedValue({ face: [{}, {}] });

    renderFlow({
      getUserMedia: vi.fn().mockResolvedValue(stream),
      analyze,
      submitPreparation: vi.fn()
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Activar cámara' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Analizar encuadre' }));
    });

    expect(await screen.findByText('Multiple faces detected.')).toBeInTheDocument();
  });

  test('blocks reference capture when the only face is outside the video frame', async () => {
    const stream = createMediaStream();
    const analyze = vi.fn().mockResolvedValue({
      face: [{ box: { x: -1, y: 160, width: 160, height: 160 } }]
    });

    renderFlow({
      getUserMedia: vi.fn().mockResolvedValue(stream),
      analyze,
      submitPreparation: vi.fn()
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Activar cámara' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Analizar encuadre' }));
    });

    expect(await screen.findByText('Face is outside the frame.')).toBeInTheDocument();
  });

  test('submits server-verifiable capture identifiers after two liveness actions', async () => {
    const stream = createMediaStream();
    const analyze = vi.fn().mockResolvedValue({
      face: [{ box: { x: 240, y: 160, width: 160, height: 160 } }]
    });
    const submitPreparation = vi.fn().mockResolvedValue({ status: 'submitted', submissionId: 'submission-1' });

    const { unmount } = renderFlow({
      getUserMedia: vi.fn().mockResolvedValue(stream),
      analyze,
      submitPreparation
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Activar cámara' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Analizar encuadre' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Completar parpadeo' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Completar giro a la izquierda' }));
    });

    await waitFor(() => {
      expect(submitPreparation).toHaveBeenCalledWith({
        apiUrl: 'https://proctoring.test',
        sessionId: '9f8e7d6c-5b4a-4321-8999-111111111111',
        browserToken: 'browser-token',
        evidence: {
          referenceCaptureId: '11111111-1111-4111-8111-111111111111',
          liveness: {
            challengeId: '7a5f8ad7-60a2-4b47-89e7-c813c8f0720d',
            captureId: '22222222-2222-4222-8222-222222222222'
          }
        }
      });
    });

    expect(await screen.findByText('Preparation submitted for verification.')).toBeInTheDocument();
    unmount();
    expect(stream.track.stop).toHaveBeenCalledOnce();
  });
});
