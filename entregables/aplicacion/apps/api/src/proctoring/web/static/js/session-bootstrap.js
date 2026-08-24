import { createSessionApi, decodeOwnedSessionId } from './api.js';
import { createPreparationFlow } from './preparation.js';

const bootstrap = document.querySelector('#session-bootstrap');
const values = {
  apiBaseUrl: bootstrap.dataset.apiBaseUrl,
  mode: bootstrap.dataset.mode,
  returnUrl: bootstrap.dataset.returnUrl || null,
  token: bootstrap.dataset.token
};
const sanitizedSessionPath = window.location.pathname.replace(/\/session\/[^/]+\/?$/, '/session');
window.history.replaceState(null, '', sanitizedSessionPath);
bootstrap.remove();

try {
  const sessionId = decodeOwnedSessionId(values.token);
  const api = createSessionApi({
    apiBaseUrl: values.apiBaseUrl,
    token: values.token,
    sessionId
  });
  const flow = createPreparationFlow({ api, mode: values.mode, returnUrl: values.returnUrl });
  void flow.initialize();
} catch {
  const error = document.querySelector('#session-error');
  error.hidden = false;
  error.querySelector('p').textContent = 'El enlace de sesión no es válido.';
  document.querySelector('#session-status').textContent = 'Proceso interrumpido.';
}
