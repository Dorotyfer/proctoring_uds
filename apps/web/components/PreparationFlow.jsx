'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { CameraCheck } from '@/components/CameraCheck';
import { EnrollmentCheck } from '@/components/EnrollmentCheck';
import { LivenessCheck } from '@/components/LivenessCheck';
import { SessionMonitor } from '@/components/SessionMonitor';
import { stopCamera } from '@/lib/camera';
import { createLivenessChallenge } from '@/lib/face-analysis';
import { createHumanDetector } from '@/lib/human';
import { activateSession, getSession, sendSessionEvent } from '@/lib/session-api';

export function PreparationFlow({ monitorMode, returnUrl, token }) {
  const challenge = useMemo(() => createLivenessChallenge(), []);
  const [capture, setCapture] = useState(null);
  const [detector, setDetector] = useState(null);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);
  const [stage, setStage] = useState('loading');
  const [stream, setStream] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      try {
        const { session: loaded } = await getSession(token);
        if (cancelled) return;
        setSession(loaded);
        setStage(loaded.status === 'active' ? 'ready' : 'camera');
      } catch {
        if (!cancelled) setError('La sesión no es válida o ha caducado.');
      }
    }
    void loadSession();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => () => stopCamera(stream), [stream]);

  const cameraReady = useCallback(async (cameraStream) => {
    setStream(cameraStream);
    setStage('loading-model');
    try {
      setDetector(await createHumanDetector());
      setStage('enrollment');
    } catch {
      stopCamera(cameraStream);
      setError('No se pudo iniciar la detección facial en este dispositivo.');
    }
  }, []);

  const enrollmentComplete = useCallback((referenceCapture) => {
    setCapture(referenceCapture);
    setStage('liveness');
  }, []);

  const reportFailure = useCallback(async (type, message) => {
    try {
      await sendSessionEvent(token, {
        clientEventId: crypto.randomUUID(),
        metadata: { stage: type },
        occurredAt: new Date().toISOString(),
        type
      });
    } catch {
      // The user-facing failure remains primary when the API is unavailable.
    }
    stopCamera(stream);
    setError(message);
  }, [stream, token]);

  const livenessComplete = useCallback(async () => {
    setStage('activating');
    try {
      const result = await activateSession(token, {
        identityPassed: true,
        livenessChallenge: challenge,
        livenessPassed: true,
        referenceCapture: capture
      });
      setSession((current) => ({ ...current, status: result.session.status }));
      setStage('ready');
    } catch {
      setError('No se pudo validar la preparación. Inténtalo nuevamente desde Moodle.');
    }
  }, [capture, challenge, token]);

  if (error) {
    return <main className="shell"><section className="card"><h1>Validación interrumpida</h1><p className="error-text">{error}</p></section></main>;
  }
  if (stage === 'ready' && monitorMode) {
    return <SessionMonitor detector={detector} stream={stream} token={token} />;
  }

  return (
    <main className="shell">
      <section className="card">
        {(stage === 'loading' || stage === 'loading-model' || stage === 'activating') && (
          <><p className="eyebrow">Proctoring UDS</p><h1>Preparando la sesión</h1><p>Este proceso puede tardar unos segundos.</p></>
        )}
        {stage === 'camera' && (
          <CameraCheck
            onFailure={() => void reportFailure('camera_interrupted', 'No fue posible acceder a la cámara.')}
            onReady={cameraReady}
          />
        )}
        {stage === 'enrollment' && (
          <EnrollmentCheck
            detector={detector}
            onComplete={enrollmentComplete}
            onFailure={() => void reportFailure('identity_check_failed', 'No se pudo obtener una captura válida.')}
            stream={stream}
          />
        )}
        {stage === 'liveness' && (
          <LivenessCheck
            challenge={challenge}
            detector={detector}
            onComplete={livenessComplete}
            onFailure={() => void reportFailure('liveness_check_failed', 'La prueba de vida no se completó a tiempo.')}
            stream={stream}
          />
        )}
        {stage === 'ready' && !monitorMode && (
          <section>
            <p className="eyebrow">Preparación completada</p>
            <h1>Ya puedes continuar</h1>
            <p>La supervisión permanecerá activa dentro del cuestionario.</p>
            {returnUrl && <a className="button" href={returnUrl}>Continuar al examen</a>}
          </section>
        )}
      </section>
    </main>
  );
}
