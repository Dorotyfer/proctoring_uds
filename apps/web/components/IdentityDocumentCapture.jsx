'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';

import { captureReference } from '@/lib/camera';

export function IdentityDocumentCapture({ onConfirm, stream }) {
  const videoRef = useRef(null);
  const [capture, setCapture] = useState(null);
  const [error, setError] = useState(null);

  function attachVideo(video) {
    videoRef.current = video;
    if (video) {
      video.srcObject = stream;
    }
  }

  function takePhoto() {
    const nextCapture = captureReference(videoRef.current);
    if (!nextCapture) {
      setError('No se pudo generar una foto válida. Ajusta el encuadre e inténtalo nuevamente.');
      return;
    }
    setCapture(nextCapture);
    setError(null);
  }

  return (
    <section aria-labelledby="identity-document-title">
      <p className="eyebrow">Paso 4 de 4</p>
      <h1 id="identity-document-title">Foto con documento de identidad</h1>
      <p>Sostén el frente de tu documento junto al rostro y asegúrate de que ambos sean visibles.</p>
      {capture ? (
        <Image
          alt="Vista previa con el documento de identidad"
          className="document-preview"
          height={480}
          src={capture}
          unoptimized
          width={640}
        />
      ) : (
        <video autoPlay className="video" muted playsInline ref={attachVideo} />
      )}
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      <div className="button-row">
        {capture ? (
          <>
            <button className="button secondary-button" onClick={() => setCapture(null)} type="button">Repetir</button>
            <button className="button" onClick={() => onConfirm(capture)} type="button">Confirmar</button>
          </>
        ) : (
          <button className="button" onClick={takePhoto} type="button">Tomar foto</button>
        )}
      </div>
    </section>
  );
}
