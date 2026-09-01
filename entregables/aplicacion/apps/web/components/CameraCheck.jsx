'use client';

import { useState } from 'react';

import { requestCamera } from '@/lib/camera';

export function CameraCheck({ onFailure, onReady, totalSteps = 3 }) {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function enableCamera() {
    setError(null);
    setLoading(true);
    try {
      onReady(await requestCamera());
    } catch {
      setError('El acceso a la cámara es obligatorio para este examen.');
      onFailure?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <p className="eyebrow">Paso 1 de {totalSteps}</p>
      <h1>Comprobar cámara</h1>
      <p>La cámara se procesa localmente y no se graba vídeo continuo.</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="button" disabled={loading} onClick={enableCamera} type="button">
        {loading ? 'Solicitando permiso…' : 'Permitir cámara'}
      </button>
    </section>
  );
}
