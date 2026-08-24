import { ApiError, pollAnalysis } from './api.js';
import { captureJpeg } from './camera.js';

const DEFAULT_INTERVAL_SECONDS = 10;
const MINIMUM_INTERVAL_SECONDS = 2;

export function createMonitoringController({ api, canvas, onStatus, video }) {
  let active = false;
  let captureTimer;
  let pending = null;
  let pendingSequence = 0;
  let uploading = false;
  let regularIntervalSeconds = DEFAULT_INTERVAL_SECONDS;
  let followUpFrames = 0;
  let followUpIntervalSeconds = MINIMUM_INTERVAL_SECONDS;

  async function start() {
    active = true;
    onStatus('Consultando disponibilidad de análisis…');
    await refreshInterval();
    scheduleCapture(500);
  }

  function stop() {
    active = false;
    window.clearTimeout(captureTimer);
    pending = null;
  }

  async function refreshInterval() {
    try {
      const status = await api.getMonitoringStatus();
      if (Number.isInteger(status.nextIntervalSeconds) && status.nextIntervalSeconds >= MINIMUM_INTERVAL_SECONDS) {
        regularIntervalSeconds = status.nextIntervalSeconds;
      }
      if (status.availability !== 'available') {
        onStatus('El servidor está procesando otras capturas; la supervisión continúa.');
      }
    } catch {
      onStatus('Sin conexión con el servicio; se conservará solamente la captura más reciente.');
    }
  }

  function scheduleCapture(delayMilliseconds = null) {
    if (!active) return;
    window.clearTimeout(captureTimer);
    const delay = delayMilliseconds ?? (
      followUpFrames > 0 ? followUpIntervalSeconds * 1000 : jitteredMilliseconds(regularIntervalSeconds)
    );
    captureTimer = window.setTimeout(captureAndQueue, delay);
  }

  async function captureAndQueue() {
    if (!active) return;
    try {
      const blob = await captureJpeg(video, canvas);
      pendingSequence += 1;
      pending = { blob, sequence: pendingSequence };
      if (followUpFrames > 0) followUpFrames -= 1;
      void flushNewest();
    } catch {
      onStatus('No fue posible obtener una captura de cámara.');
    } finally {
      scheduleCapture();
    }
  }

  async function flushNewest() {
    if (!active || uploading || !pending || !navigator.onLine) return;
    uploading = true;
    const candidate = pending;
    const analysisId = crypto.randomUUID();
    const body = new FormData();
    body.set('analysisId', analysisId);
    body.set('frame', candidate.blob, 'monitoring.jpg');

    try {
      await api.submitMonitoring(body);
      if (pending?.sequence === candidate.sequence) pending = null;
      onStatus('Captura enviada; supervisión activa.');
      void pollMonitoringResult(analysisId);
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        const delay = Math.max(error.retryAfterSeconds ?? regularIntervalSeconds, MINIMUM_INTERVAL_SECONDS);
        onStatus('Capacidad temporalmente ocupada; se conservará solamente la captura más reciente.');
        window.setTimeout(flushNewest, delay * 1000);
      } else if (error instanceof ApiError && error.status === 409) {
        pending = null;
        onStatus('La sesión ya no está activa.');
      } else {
        onStatus('Conexión interrumpida; se conservará solamente la captura más reciente.');
      }
    } finally {
      uploading = false;
    }
  }

  async function pollMonitoringResult(analysisId) {
    try {
      const analysis = await pollAnalysis(api, analysisId, { intervalMs: 1000 });
      if (analysis.state !== 'completed') return;
      const recommendation = analysis.result;
      if (recommendation?.followUpFrames === 2 && recommendation.followUpIntervalSeconds === 2) {
        followUpFrames = 2;
        followUpIntervalSeconds = 2;
        scheduleCapture(2000);
        onStatus('El servidor solicitó capturas de confirmación; supervisión activa.');
      }
      await refreshInterval();
    } catch {
      // The regular capture loop remains authoritative during transient polling failures.
    }
  }

  const online = () => void flushNewest();
  window.addEventListener('online', online);

  return {
    start,
    stop() {
      window.removeEventListener('online', online);
      stop();
    },
    flushNewest
  };
}

function jitteredMilliseconds(seconds) {
  const bounded = Math.max(seconds, MINIMUM_INTERVAL_SECONDS);
  const jitter = 0.9 + Math.random() * 0.2;
  return Math.round(bounded * jitter * 1000);
}
