'use client';

import { useEffect, useRef, useState } from 'react';

import { captureReference } from '@/lib/camera';
import { describeFaceState, extractFaceEmbedding } from '@/lib/face-analysis';
import { detectFrame } from '@/lib/human';

const messages = {
  absent: 'Ubica tu rostro frente a la cámara.',
  multiple: 'Debe aparecer una sola persona.',
  'out-of-frame': 'Centra el rostro y mantén cierta distancia.',
  valid: 'Mantén la posición mientras realizamos la captura.'
};

export function EnrollmentCheck({ detector, onComplete, onFailure, stream, totalSteps = 3 }) {
  const completed = useRef(false);
  const videoRef = useRef(null);
  const validFrames = useRef(0);
  const embeddings = useRef([]);
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
      const embedding = description.state === 'valid' ? extractFaceEmbedding(description.face) : null;
      validFrames.current = embedding ? validFrames.current + 1 : 0;
      if (embedding) {
        embeddings.current = [...embeddings.current, embedding].slice(-3);
      }
      if (validFrames.current >= 5 && embeddings.current.length === 3 && !completed.current) {
        completed.current = true;
        onComplete({
          biometricSamples: embeddings.current,
          referenceCapture: captureReference(video)
        });
      }
    }

    const interval = window.setInterval(() => void inspect(), 500);
    const timeout = window.setTimeout(() => {
      if (!completed.current) {
        onFailure(video.readyState >= 2 ? captureReference(video) : null);
      }
    }, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [detector, onComplete, onFailure, stream]);

  return (
    <section>
      <p className="eyebrow">Paso 2 de {totalSteps}</p>
      <h1>Captura de referencia</h1>
      <video autoPlay className="video" muted playsInline ref={videoRef} />
      <p aria-live="polite">{messages[state]}</p>
    </section>
  );
}
