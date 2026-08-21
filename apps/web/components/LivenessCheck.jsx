'use client';

import { useEffect, useRef, useState } from 'react';

import { captureReference } from '@/lib/camera';
import { describeFaceState, evaluateChallengeStep } from '@/lib/face-analysis';
import { detectFrame } from '@/lib/human';

const labels = {
  blink: 'Parpadea',
  'turn-left': 'Gira el rostro a la izquierda',
  'turn-right': 'Gira el rostro a la derecha'
};

export function LivenessCheck({ challenge, detector, onComplete, onFailure, stream }) {
  const completed = useRef(false);
  const videoRef = useRef(null);
  const stepState = useRef({});
  const [currentStep, setCurrentStep] = useState(0);
  const [message, setMessage] = useState(labels[challenge[0]]);

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
      if (description.state !== 'valid') {
        setMessage('Mantén un solo rostro centrado en la cámara.');
        return;
      }

      const evaluation = evaluateChallengeStep(
        challenge[currentStep],
        description.face,
        stepState.current
      );
      stepState.current = evaluation.state;
      if (!evaluation.passed || cancelled) {
        setMessage(labels[challenge[currentStep]]);
        return;
      }

      if (currentStep === challenge.length - 1) {
        if (!completed.current) {
          completed.current = true;
          onComplete();
        }
        return;
      }
      stepState.current = {};
      setCurrentStep((step) => step + 1);
      setMessage(labels[challenge[currentStep + 1]]);
    }

    const interval = window.setInterval(() => void inspect(), 300);
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
  }, [challenge, currentStep, detector, onComplete, onFailure, stream]);

  return (
    <section>
      <p className="eyebrow">Paso 3 de 3</p>
      <h1>Prueba de vida</h1>
      <ul className="steps">
        {challenge.map((step, index) => (
          <li className={index === currentStep ? 'active' : ''} key={step}>{labels[step]}</li>
        ))}
      </ul>
      <video autoPlay className="video" muted playsInline ref={videoRef} />
      <p aria-live="polite">{message}</p>
    </section>
  );
}
