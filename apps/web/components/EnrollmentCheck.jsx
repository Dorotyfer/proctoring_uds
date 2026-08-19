'use client';

import { useEffect, useRef, useState } from 'react';

import { captureReference } from '@/lib/camera';
import { describeFaceState } from '@/lib/face-analysis';
import { detectFrame } from '@/lib/human';

const messages = {
  absent: 'Ubica tu rostro frente a la cámara.',
  multiple: 'Debe aparecer una sola persona.',
  'out-of-frame': 'Centra el rostro y mantén cierta distancia.',
  valid: 'Mantén la posición mientras realizamos la captura.'
};

export function EnrollmentCheck({ detector, onComplete, onFailure, stream }) {
  const completed = useRef(false);
  const videoRef = useRef(null);
  const validFrames = useRef(0);
  const [state, setState] = useState('absent');

  useEffect(() => {
    const video = videoRef.current;
    video.srcObject = stream;
    let cancelled = false;

    async function inspect() {
      if (cancelled || video.readyState < 2) {
        return;
      }
      const result = await detectFrame(detector, video);
      const description = describeFaceState(result, {
        height: video.videoHeight,
        width: video.videoWidth
      });
      if (cancelled) {
        return;
      }
      setState(description.state);
      validFrames.current = description.state === 'valid' ? validFrames.current + 1 : 0;
      if (validFrames.current >= 5 && !completed.current) {
        completed.current = true;
        onComplete(captureReference(video));
      }
    }

    const interval = window.setInterval(() => void inspect(), 500);
    const timeout = window.setTimeout(() => {
      if (!completed.current) onFailure();
    }, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [detector, onComplete, onFailure, stream]);

  return (
    <section>
      <p className="eyebrow">Paso 2 de 3</p>
      <h1>Captura de referencia</h1>
      <video autoPlay className="video" muted playsInline ref={videoRef} />
      <p aria-live="polite">{messages[state]}</p>
    </section>
  );
}
