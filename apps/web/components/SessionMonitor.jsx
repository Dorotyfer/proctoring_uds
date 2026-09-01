'use client';

import { useEffect, useRef, useState } from 'react';

import { captureReference, requestCamera, stopCamera } from '@/lib/camera';
import { createEventBuffer } from '@/lib/event-buffer';
import { createIncidentBuffer } from '@/lib/incident-buffer';
import { describeAttentionSignal, describeFaceState } from '@/lib/face-analysis';
import { createBiometricMonitor } from '@/lib/biometric-monitor';
import { createEnvironmentTracker } from '@/lib/environment-analysis';
import { createFacialPatternTracker } from '@/lib/facial-pattern-analysis';
import { createDeviceSignalMonitor } from '@/lib/device-signals';
import { createHumanDetector, detectFrame } from '@/lib/human';
import { deliverIncident } from '@/lib/incident-delivery';
import { createIncident } from '@/lib/incident-payload';
import { createFaceStateTracker, isAlertType } from '@/lib/monitor-state';
import { getSafeExamBrowserMetadata } from '@/lib/seb-events';
import { readSessionId, sendBiometricCheck, sendEvidence, sendIncident, sendSessionEvent } from '@/lib/session-api';

export function SessionMonitor({ biometricStatus, deviceMode, deviceModePolicy, detector: initialDetector, policy, stream: initialStream, token }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('starting');
  const [pendingIncidents, setPendingIncidents] = useState(0);
  const [incidentError, setIncidentError] = useState(false);
  const [biometricMonitorStatus, setBiometricMonitorStatus] = useState('starting');

  useEffect(() => {
    let cancelled = false;
    let detectionInterval;
    let evidenceInterval;
    let flushInterval;
    let biometricMonitor;
    let deviceSignalMonitor;
    let stream = initialStream;
    const buffer = createEventBuffer(readSessionId(token), (event) => sendSessionEvent(token, event));
    const incidentBuffer = createIncidentBuffer(readSessionId(token), (incident) => sendIncident(token, incident));
    const tracker = createFaceStateTracker();
    const facialSignalEnabled = process.env.NEXT_PUBLIC_ENABLE_FACIAL_PATTERN === 'true' &&
      policy?.signals?.some((signal) => signal.type === 'facial_pattern_detected');
    const environmentSignal = policy?.signals?.find((signal) => signal.type === 'environment_intrusion');
    const facialTracker = facialSignalEnabled ? createFacialPatternTracker() : null;
    const environmentTracker = process.env.NEXT_PUBLIC_ENABLE_ENVIRONMENT_ANALYSIS === 'true' && environmentSignal
      ? createEnvironmentTracker({
        alertableObjects: ['person', 'phone', 'laptop', 'screen', 'document'],
        allowedObjects: []
      })
      : null;

    async function emit(type, metadata = {}) {
      const video = videoRef.current;
      if (isAlertType(type)) {
        try {
          const capture = video?.readyState >= 2 ? captureReference(video) : null;
          const result = await deliverIncident({
            buffer: incidentBuffer,
            incident: createIncident(type, capture, metadata),
            sendIncident: (incident) => sendIncident(token, incident),
            sendSessionEvent: (sessionId, event) => sendSessionEvent(token, event),
            sessionId: readSessionId(token)
          });
          if (result === 'event_fallback') {
            setIncidentError(true);
          }
          setPendingIncidents(await incidentBuffer.size());
          setIncidentError(Boolean(incidentBuffer.error()) || result === 'event_fallback');
        } catch {
          setIncidentError(true);
          buffer.enqueue(type, { ...metadata, captureQueue: 'unavailable' });
        }
      } else {
        buffer.enqueue(type, metadata);
      }
      if (navigator.onLine) {
        await buffer.flush();
      }
    }

    async function flushIncidents() {
      try {
        const remaining = await incidentBuffer.flush();
        setPendingIncidents(remaining);
        setIncidentError(Boolean(incidentBuffer.error()));
      } catch {
        setIncidentError(true);
      }
    }

    async function start() {
      try {
        const [cameraStream, detector] = await Promise.all([
          stream ? Promise.resolve(stream) : requestCamera(),
          initialDetector ? Promise.resolve(initialDetector) : createHumanDetector()
        ]);
        if (cancelled) {
          if (!initialStream) stopCamera(cameraStream);
          return;
        }
        stream = cameraStream;
        videoRef.current.srcObject = stream;
        const sebMetadata = getSafeExamBrowserMetadata();
        const actualDeviceMode = sebMetadata ? 'seb' : 'browser';
        const modePolicy = deviceModePolicy ?? (deviceMode ?? 'either');
        if ((modePolicy === 'seb' && actualDeviceMode !== 'seb') ||
          (modePolicy === 'browser' && actualDeviceMode !== 'browser')) {
          await emit('device_mode_mismatch', {
            expected: modePolicy,
            actual: actualDeviceMode
          });
        }
        if (deviceMode === 'seb') {
          await emit('seb_event', {
            event: 'monitor_started',
            ...sebMetadata
          });
        }
        stream.getVideoTracks().forEach((track) => {
          track.addEventListener('ended', () => void emit('camera_interrupted', { source: 'track-ended' }), { once: true });
        });
        setStatus('active');
        deviceSignalMonitor = createDeviceSignalMonitor({
          emit: async (type, metadata) => {
            if (type === 'network_disconnected' || type === 'page_visibility_changed' && metadata.hidden) {
              setStatus('warning');
            }
            if (type === 'network_reconnected' || type === 'window_focus') {
              setStatus('active');
            }
            await emit(type, metadata);
          }
        });
        deviceSignalMonitor.start();
        biometricMonitor = createBiometricMonitor({
          detector,
          getCapture: () => {
            const currentVideo = videoRef.current;
            return currentVideo?.readyState >= 2 ? captureReference(currentVideo) : null;
          },
          getVideo: () => videoRef.current,
          onResult: (result) => setBiometricMonitorStatus(result.status ?? 'unavailable'),
          sendCheck: (check) => sendBiometricCheck(token, check)
        });
        biometricMonitor.start();
        setBiometricMonitorStatus('active');
        if (navigator.onLine) {
          await flushIncidents();
        }

        detectionInterval = window.setInterval(async () => {
          const video = videoRef.current;
          if (!video || video.readyState < 2) return;
          try {
            const result = await detectFrame(detector, video);
            const faceState = describeFaceState(result, {
              height: video.videoHeight,
              width: video.videoWidth
            }).state;
            const eventType = tracker.update(faceState);
            if (eventType) await emit(eventType, { faceState });
            if (faceState === 'valid' && facialTracker) {
              const attentionSignal = describeAttentionSignal(result);
              const facialSignal = attentionSignal
                ? facialTracker.update({ ...attentionSignal, modelVersion: 'human-3.3.6' })
                : null;
              if (facialSignal) await emit('facial_pattern_detected', facialSignal);
            }
            if (environmentTracker && Array.isArray(result?.object)) {
              const environmentSignal = environmentTracker.update(
                result.object.map((object) => ({
                  box: object.box,
                  confidence: object.score ?? object.confidence,
                  label: object.label
                })),
                video.videoWidth,
                video.videoHeight
              );
              if (environmentSignal) await emit('environment_intrusion', environmentSignal);
            }
          } catch {
            await emit('camera_interrupted', { source: 'detection-error' });
          }
        }, 1000);
        evidenceInterval = window.setInterval(() => {
          const video = videoRef.current;
          if (video?.readyState >= 2 && navigator.onLine) {
            void sendEvidence(token, 'interval', captureReference(video)).catch(() => {});
          }
        }, getEvidenceIntervalMs());
      } catch {
        setStatus('warning');
        await emit('camera_interrupted', { source: 'camera-start' });
      }
    }

    flushInterval = window.setInterval(() => {
      if (!navigator.onLine) return;
      void flushIncidents();
      void buffer.flush();
    }, 3000);
    void start();

    return () => {
      cancelled = true;
      deviceSignalMonitor?.stop();
      window.clearInterval(detectionInterval);
      window.clearInterval(evidenceInterval);
      window.clearInterval(flushInterval);
      biometricMonitor?.stop();
      if (!initialStream) stopCamera(stream);
    };
  }, [deviceMode, initialDetector, initialStream, token]);

  return (
    <main>
      <section className="card compact">
        <p className="status" role="status">
          <span className={`status-dot ${status === 'warning' ? 'warning' : ''}`} />
          {status === 'active' ? 'Supervisión activa' : status === 'warning' ? 'Supervisión con incidencias' : 'Iniciando supervisión'}
        </p>
        {pendingIncidents > 0 ? <p className="status warning" aria-live="polite">Capturas pendientes de enviar: {pendingIncidents}</p> : null}
        {incidentError ? <p className="error-text" role="alert">No se pudo guardar una captura; se reintentará automáticamente.</p> : null}
        {biometricStatus === 'enrolled' ? <p className="status" role="status">Biometría registrada.</p> : null}
        {biometricStatus === 'matched' ? <p className="status" role="status">Identidad coincidente.</p> : null}
        {biometricStatus === 'mismatch' ? <p className="error-text" role="alert">Identidad no coincidente; alerta enviada.</p> : null}
        <p className="status" role="status">
          Biometría continua: {biometricMonitorStatus === 'matched'
            ? 'coincidente'
            : biometricMonitorStatus === 'mismatch'
              ? 'no coincidente'
              : biometricMonitorStatus === 'unavailable'
                ? 'no disponible'
                : biometricMonitorStatus === 'checking'
                  ? 'pendiente'
                  : 'activa'}
        </p>
        <video autoPlay className="monitor-video" muted playsInline ref={videoRef} />
      </section>
    </main>
  );
}

function getEvidenceIntervalMs() {
  const seconds = Number(process.env.NEXT_PUBLIC_EVIDENCE_INTERVAL_SECONDS ?? 60);
  if (!Number.isFinite(seconds)) {
    return 60000;
  }
  return Math.min(Math.max(seconds, 30), 600) * 1000;
}
