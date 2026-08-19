'use client';

import { useEffect, useRef, useState } from 'react';

import { captureReference, requestCamera, stopCamera } from '@/lib/camera';
import { createEventBuffer } from '@/lib/event-buffer';
import { describeFaceState } from '@/lib/face-analysis';
import { createHumanDetector, detectFrame } from '@/lib/human';
import { createFaceStateTracker } from '@/lib/monitor-state';
import { readSessionId, sendEvidence, sendSessionEvent } from '@/lib/session-api';

export function SessionMonitor({ detector: initialDetector, stream: initialStream, token }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('starting');

  useEffect(() => {
    let cancelled = false;
    let detectionInterval;
    let evidenceInterval;
    let flushInterval;
    let lastAlertCaptureAt = 0;
    let stream = initialStream;
    const buffer = createEventBuffer(readSessionId(token), (event) => sendSessionEvent(token, event));
    const tracker = createFaceStateTracker();

    async function emit(type, metadata = {}) {
      buffer.enqueue(type, metadata);
      const video = videoRef.current;
      if (video?.readyState >= 2 && Date.now() - lastAlertCaptureAt >= 15000) {
        lastAlertCaptureAt = Date.now();
        void sendEvidence(token, 'alert', captureReference(video)).catch(() => {});
      }
      if (navigator.onLine) {
        await buffer.flush();
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
        stream.getVideoTracks().forEach((track) => {
          track.addEventListener('ended', () => void emit('camera_interrupted', { source: 'track-ended' }), { once: true });
        });
        setStatus('active');

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

    const visibilityChanged = () => void emit('page_visibility_changed', { hidden: document.hidden });
    const wentOffline = () => {
      setStatus('warning');
      buffer.enqueue('network_disconnected');
    };
    const cameOnline = () => {
      setStatus('active');
      buffer.enqueue('network_reconnected');
      void buffer.flush();
    };

    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('offline', wentOffline);
    window.addEventListener('online', cameOnline);
    flushInterval = window.setInterval(() => navigator.onLine && void buffer.flush(), 3000);
    void start();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('offline', wentOffline);
      window.removeEventListener('online', cameOnline);
      window.clearInterval(detectionInterval);
      window.clearInterval(evidenceInterval);
      window.clearInterval(flushInterval);
      if (!initialStream) stopCamera(stream);
    };
  }, [initialDetector, initialStream, token]);

  return (
    <main>
      <section className="card compact">
        <p className="status" role="status">
          <span className={`status-dot ${status === 'warning' ? 'warning' : ''}`} />
          {status === 'active' ? 'Supervisión activa' : status === 'warning' ? 'Supervisión con incidencias' : 'Iniciando supervisión'}
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
