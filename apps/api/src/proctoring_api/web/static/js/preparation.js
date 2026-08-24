import { ApiError, pollAnalysis, wait } from './api.js';
import { attachCamera, captureJpeg, requestCamera, stopCamera } from './camera.js';
import { createEventQueue, installSessionEventListeners } from './event-queue.js';
import { createMonitoringController } from './monitoring.js';

const STEP_LABELS = {
  center: 'center',
  'turn-left': 'turn-left',
  'turn-right': 'turn-right'
};

export function createPreparationFlow({ api, mode, returnUrl }) {
  const elements = collectElements();
  let stream = null;
  let session = null;
  let challenge = null;
  let frames = [];
  let stepIndex = 0;
  let eventQueue = null;
  let removeEventListeners = null;
  let monitoring = null;

  elements.consent.addEventListener('change', () => {
    elements.startCamera.disabled = !elements.consent.checked;
  });
  elements.startCamera.addEventListener('click', () => void beginPreparation());
  elements.captureStep.addEventListener('click', () => void captureChallengeStep());
  elements.retry.addEventListener('click', () => window.location.reload());
  window.addEventListener('pagehide', cleanup, { once: true });

  async function initialize() {
    setStatus('Cargando sesión…');
    try {
      session = (await api.getSession()).session;
      if (mode === 'monitor') {
        if (session.status !== 'active') throw new Error('monitor_session_inactive');
        await openCamera();
        startMonitoring();
        return;
      }
      if (session.status === 'active') {
        completePreparation(null);
        return;
      }
      elements.consentView.hidden = false;
      setStatus('Leé y aceptá el consentimiento para continuar.');
    } catch {
      showError('La sesión no es válida, no está activa o ha caducado.');
    }
  }

  async function beginPreparation() {
    if (!elements.consent.checked) return;
    elements.startCamera.disabled = true;
    try {
      await openCamera();
      const payload = await api.createChallenge();
      challenge = payload.challenge;
      if (!validChallenge(challenge)) throw new Error('invalid_challenge');
      frames = [];
      stepIndex = 0;
      renderChallenge();
      setStatus('Seguí las indicaciones y capturá cada posición.');
    } catch {
      showError('No fue posible activar la cámara o iniciar la prueba de vida. Revisá el permiso de cámara.');
    }
  }

  async function openCamera() {
    stream = await requestCamera();
    await attachCamera(elements.video, stream);
    elements.consentView.hidden = true;
    elements.cameraView.hidden = false;
    elements.cameraStatus.lastChild.textContent = ' Cámara activa.';
    elements.cameraStatus.querySelector('.status-dot').classList.remove('warning');
    eventQueue = createEventQueue(session.id, api.sendEvent);
    eventQueue.start();
    removeEventListeners = installSessionEventListeners(eventQueue, {
      deviceMode: session.deviceMode,
      stream
    });
  }

  async function captureChallengeStep() {
    elements.captureStep.disabled = true;
    try {
      frames.push(await captureJpeg(elements.video, elements.canvas));
      stepIndex += 1;
      if (stepIndex < challenge.steps.length) {
        renderChallenge();
        return;
      }
      await submitPreparation();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        showError('El desafío ya fue usado o caducó. Volvé a iniciar la preparación.');
      } else {
        showError('No fue posible capturar o enviar las imágenes. Reintentá la preparación.');
      }
    } finally {
      elements.captureStep.disabled = false;
    }
  }

  function renderChallenge() {
    elements.steps.replaceChildren(...challenge.steps.map((step, index) => {
      const item = document.createElement('li');
      item.textContent = STEP_LABELS[step];
      if (index === stepIndex) {
        item.classList.add('active');
        item.setAttribute('aria-current', 'step');
      }
      return item;
    }));
    const current = challenge.steps[stepIndex];
    elements.prompt.textContent = current;
    elements.prompt.focus();
    elements.captureStep.textContent = `Capturar ${current}`;
    elements.captureStep.hidden = false;
  }

  async function submitPreparation() {
    elements.captureStep.hidden = true;
    setStatus('Enviando capturas para análisis…');
    const analysisId = crypto.randomUUID();
    const body = preparationBody(analysisId);
    while (true) {
      try {
        await api.submitPreparation(body);
        break;
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 429) throw error;
        const seconds = Math.max(error.retryAfterSeconds ?? 2, 1);
        setStatus(`El servidor está ocupado. Reintentando en ${seconds} segundos…`);
        await wait(seconds * 1000);
      }
    }

    const analysis = await pollAnalysis(api, analysisId, {
      intervalMs: 1000,
      onUpdate: (current) => setStatus(`Análisis: ${current.state}.`)
    });
    const refreshed = (await api.getSession()).session;
    session = refreshed;
    if (analysis.state !== 'completed' || session.status !== 'active') {
      showError('La preparación no pudo completarse. Regresá a Moodle e intentá nuevamente.');
      return;
    }
    completePreparation(analysis.result);
  }

  function preparationBody(analysisId) {
    const body = new FormData();
    body.set('analysisId', analysisId);
    body.set('consentAccepted', 'true');
    body.set('challengeId', challenge.id);
    body.set('centerStart', frames[0], 'center-start.jpg');
    body.set('turn', frames[1], 'turn.jpg');
    body.set('centerEnd', frames[2], 'center-end.jpg');
    return body;
  }

  function completePreparation(result) {
    stopCamera(stream);
    elements.cameraView.hidden = true;
    elements.completeView.hidden = false;
    elements.result.textContent = preparationResult(result);
    setStatus('Sesión activa.');
    if (returnUrl) {
      elements.continueLink.href = returnUrl;
      elements.continueLink.hidden = false;
      elements.continueLink.focus();
    }
  }

  function startMonitoring() {
    elements.monitorView.hidden = false;
    elements.captureStep.hidden = true;
    elements.steps.hidden = true;
    elements.prompt.hidden = true;
    setStatus('Supervisión activa.');
    monitoring = createMonitoringController({
      api,
      canvas: elements.canvas,
      onStatus: setStatus,
      video: elements.video
    });
    void monitoring.start();
  }

  function showError(message) {
    elements.error.hidden = false;
    elements.error.querySelector('p').textContent = message;
    elements.retry.focus();
    setStatus('Proceso interrumpido.');
  }

  function setStatus(message) {
    elements.status.textContent = message;
  }

  function cleanup() {
    monitoring?.stop();
    removeEventListeners?.();
    eventQueue?.stop();
    stopCamera(stream);
  }

  return { initialize };
}

function collectElements() {
  return {
    canvas: document.querySelector('#capture-canvas'),
    cameraStatus: document.querySelector('#camera-status'),
    cameraView: document.querySelector('#camera-view'),
    captureStep: document.querySelector('#capture-step'),
    completeView: document.querySelector('#complete-view'),
    consent: document.querySelector('#biometric-consent'),
    consentView: document.querySelector('#consent-view'),
    continueLink: document.querySelector('#continue-link'),
    error: document.querySelector('#session-error'),
    monitorView: document.querySelector('#monitor-view'),
    prompt: document.querySelector('#challenge-prompt'),
    result: document.querySelector('#preparation-result'),
    retry: document.querySelector('#retry-session'),
    startCamera: document.querySelector('#start-camera'),
    status: document.querySelector('#session-status'),
    steps: document.querySelector('#challenge-steps'),
    video: document.querySelector('#camera-video')
  };
}

function validChallenge(value) {
  return value && typeof value.id === 'string' && Array.isArray(value.steps) && value.steps.length === 3 &&
    value.steps[0] === 'center' && ['turn-left', 'turn-right'].includes(value.steps[1]) && value.steps[2] === 'center';
}

function preparationResult(result) {
  if (result?.identity === 'enrolled') return 'Biometría registrada e identidad validada.';
  if (result?.identity === 'matched') return 'Identidad coincidente.';
  if (result?.identity === 'mismatch') return 'La política institucional permitió continuar y registró una alerta para revisión humana.';
  return 'La preparación fue aceptada por el servidor.';
}
