'use client';

import React, { useEffect, useRef, useState } from 'react';

import { requestCamera, stopCamera } from '../lib/camera.js';

export function CameraCheck({ getUserMedia = requestCamera, onCameraReady, onCameraError }) {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => () => stopCamera(stream), [stream]);

  async function startCamera() {
    if (stream || starting) {
      return;
    }

    setStarting(true);
    let nextStream;
    try {
      nextStream = await getUserMedia();
      const video = videoRef.current;
      if (!video) {
        stopCamera(nextStream);
        return;
      }
      video.srcObject = nextStream;
      await video.play?.();
      setStream(nextStream);
      onCameraReady({ stream: nextStream, video });
    } catch (error) {
      stopCamera(nextStream);
      onCameraError(error);
    } finally {
      setStarting(false);
    }
  }

  return (
    <section aria-labelledby="camera-title">
      <h2 id="camera-title">Camera</h2>
      <video ref={videoRef} autoPlay muted playsInline />
      <button type="button" onClick={startCamera} disabled={starting || Boolean(stream)}>
        Activar cámara
      </button>
    </section>
  );
}
