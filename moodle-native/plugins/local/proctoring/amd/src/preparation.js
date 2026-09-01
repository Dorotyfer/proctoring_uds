define([
  'local_proctoring/camera',
  'local_proctoring/consent',
  'local_proctoring/enrollment',
  'local_proctoring/liveness',
  'local_proctoring/identity_document',
  'local_proctoring/session_api',
  'local_proctoring/event_buffer'
], function(camera, consent, enrollment, liveness, identityDocument, sessionApi, eventBuffer) {
  function getRoot() {
    return document.querySelector('.local-proctoring-preparation');
  }

  function render(root, step, message) {
    if (!root) {
      return;
    }
    root.dataset.step = step;
    root.innerHTML = `<p>${message}</p>`;
  }

  async function run(config, root) {
    const attemptid = Number(config.attemptid);
    let stream;
    try {
      render(root, 'camera', 'Solicitando acceso a la cámara…');
      stream = await camera.request({video: true, audio: false});
      render(root, 'liveness', 'Verificando prueba de vida…');
      const challenge = liveness.createChallenge();
      if (!liveness.verify(challenge, config.livenessResponses || [])) {
        await sessionApi.recordIncident(attemptid, {type: 'liveness_check_failed', metadata: {source: 'preparation'}});
        throw new Error('liveness_failed');
      }
      render(root, 'identity_document', 'Validando documento de identidad…');
      if (config.identityDocument) {
        const validation = identityDocument.validate(config.identityDocument);
        if (!validation.valid) {
          throw new Error(`identity_document_${validation.reason}`);
        }
      }
      render(root, 'activate', 'Activando el intento…');
      const buffer = eventBuffer.create(attemptid, (events) => sessionApi.recordEvents(attemptid, events));
      buffer.push({
        clienteventid: `preparation-${Date.now()}`,
        type: 'preparation_completed',
        occurredat: Date.now(),
        metadata: {consent: consent.payload(config.consentVersion)}
      });
      await buffer.flush();
      return await sessionApi.activateAttempt(attemptid, {prepared: true, consent: true, devicemode: 'browser'});
    } catch (error) {
      render(root, 'error', error.message === 'camera_denied' ? 'No se concedió acceso a la cámara.' : 'No fue posible completar la preparación.');
      throw error;
    } finally {
      camera.stop(stream);
    }
  }

  function start(config = {}) {
    const root = getRoot();
    render(root, 'consent', 'Acepta el consentimiento para iniciar la preparación de proctoring.');
    if (config.autoStart !== true) {
      return Promise.resolve({step: 'consent'});
    }
    return run(config, root);
  }

  return {start, run};
});
