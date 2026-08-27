'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { CameraCheck } from '@/components/CameraCheck';
import { BiometricConsent } from '@/components/BiometricConsent';
import { EnrollmentCheck } from '@/components/EnrollmentCheck';
import { IdentityDocumentCapture } from '@/components/IdentityDocumentCapture';
import { LivenessCheck } from '@/components/LivenessCheck';
import { SessionMonitor } from '@/components/SessionMonitor';
import { stopCamera } from '@/lib/camera';
import { createLivenessChallenge } from '@/lib/face-analysis';
import { createHumanDetector } from '@/lib/human';
import { createIncidentBuffer } from '@/lib/incident-buffer';
import { deliverIncident } from '@/lib/incident-delivery';
import { createIncident } from '@/lib/incident-payload';
import { activateSession, getSession, readSessionId, sendIncident, sendSessionEvent } from '@/lib/session-api';

export function PreparationFlow({ monitorMode, returnUrl, token }) {
  const challenge = useMemo(() => createLivenessChallenge(), []);
  const [capture, setCapture] = useState(null);
  const [biometricSamples, setBiometricSamples] = useState(null);
  const [biometricStatus, setBiometricStatus] = useState(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [detector, setDetector] = useState(null);
  const [error, setError] = useState(null);
  const [identityDocumentRequired, setIdentityDocumentRequired] = useState(false);
  const [session, setSession] = useState(null);
  const [stage, setStage] = useState('loading');
  const [stream, setStream] = useState(null);
  const incidentBuffer = useMemo(
    () => createIncidentBuffer(readSessionId(token), (incident) => sendIncident(token, incident)),
    [token]
  );

  useEffect(() => {
    const retry = () => {
      if (navigator.onLine) {
        void incidentBuffer.flush().catch(() => {});
      }
    };
    const interval = window.setInterval(retry, 3000);
    window.addEventListener('online', retry);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', retry);
    };
  }, [incidentBuffer]);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      try {
        const { session: loaded } = await getSession(token);
        if (cancelled) return;
        setSession(loaded);
        setIdentityDocumentRequired(loaded.identityDocumentRequired === true);
        if (loaded.status === 'active') {
          setStage('ready');
        } else if (['unregistered', 'revoked'].includes(loaded.biometric?.state)) {
          setStage('consent');
        } else {
          setStage('camera');
        }
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

  const enrollmentComplete = useCallback(({ biometricSamples: samples, referenceCapture }) => {
    setBiometricSamples(samples);
    setCapture(referenceCapture);
    setStage('liveness');
  }, []);

  const reportFailure = useCallback(async (type, message, capture = null) => {
    const incident = createIncident(type, capture, { stage: type });
    try {
      await deliverIncident({
        buffer: incidentBuffer,
        incident,
        sendIncident: (payload) => sendIncident(token, payload),
        sendSessionEvent: (sessionId, event) => sendSessionEvent(token, event),
        sessionId: readSessionId(token)
      });
    } catch {
      // The user-facing failure remains primary when the API is unavailable.
    }
    stopCamera(stream);
    setError(message);
  }, [incidentBuffer, stream]);

  const activatePreparedSession = useCallback(async (documentCapture = null) => {
    setStage('activating');
    try {
      const result = await activateSession(token, {
        biometricConsentAccepted: consentAccepted,
        biometricSamples,
        documentCapture: documentCapture ?? undefined,
        identityPassed: true,
        livenessChallenge: challenge,
        livenessPassed: true,
        referenceCapture: capture
      });
      setBiometricStatus(result.biometric?.status ?? null);
      setSession((current) => ({ ...current, status: result.session.status }));
      setStage('ready');
    } catch {
      setError('No se pudo validar la preparación. Inténtalo nuevamente desde Moodle.');
    }
  }, [biometricSamples, capture, challenge, consentAccepted, token]);

  const livenessComplete = useCallback(() => {
    if (identityDocumentRequired) {
      setStage('identity-document');
      return;
    }
    void activatePreparedSession();
  }, [activatePreparedSession, identityDocumentRequired]);

  const totalSteps = identityDocumentRequired ? 4 : 3;

  if (error) {
    return <main className="shell"><section className="card"><h1>Validación interrumpida</h1><p className="error-text">{error}</p></section></main>;
  }
  if (stage === 'ready' && monitorMode) {
    return <SessionMonitor biometricStatus={biometricStatus} deviceMode={session?.deviceMode} detector={detector} stream={stream} token={token} />;
  }

  return (
    <main className="shell">
      <section className="card">
        {(stage === 'loading' || stage === 'loading-model' || stage === 'activating') && (
          <><p className="eyebrow">Proctoring UDS</p><h1>Preparando la sesión</h1><p>Este proceso puede tardar unos segundos.</p></>
        )}
        {stage === 'consent' && (
          <BiometricConsent
            onAccept={() => {
              setConsentAccepted(true);
              setStage('camera');
            }}
          />
        )}
        {stage === 'camera' && (
          <CameraCheck
            onFailure={() => void reportFailure('camera_interrupted', 'No fue posible acceder a la cámara.')}
            onReady={cameraReady}
            totalSteps={totalSteps}
          />
        )}
        {stage === 'enrollment' && (
          <EnrollmentCheck
            detector={detector}
            onComplete={enrollmentComplete}
            onFailure={(failureCapture) => void reportFailure('identity_check_failed', 'No se pudo obtener una captura válida.', failureCapture)}
            stream={stream}
            totalSteps={totalSteps}
          />
        )}
        {stage === 'liveness' && (
          <LivenessCheck
            challenge={challenge}
            detector={detector}
            onComplete={livenessComplete}
            onFailure={(failureCapture) => void reportFailure('liveness_check_failed', 'La prueba de vida no se completó a tiempo.', failureCapture)}
            stream={stream}
            totalSteps={totalSteps}
          />
        )}
        {stage === 'identity-document' && (
          <IdentityDocumentCapture
            onConfirm={(documentCapture) => void activatePreparedSession(documentCapture)}
            stream={stream}
          />
        )}
        {stage === 'ready' && !monitorMode && (
          <section>
            <p className="eyebrow">Preparación completada</p>
            <h1>Ya puedes continuar</h1>
            <p>La supervisión permanecerá activa dentro del cuestionario.</p>
            {biometricStatus === 'enrolled' && <p role="status">Biometría registrada.</p>}
            {biometricStatus === 'matched' && <p role="status">Identidad coincidente.</p>}
            {biometricStatus === 'mismatch' && <p className="error-text" role="alert">Identidad no coincidente; alerta enviada.</p>}
            {returnUrl && <a className="button" href={returnUrl}>Continuar al examen</a>}
          </section>
        )}
      </section>
    </main>
  );
}
