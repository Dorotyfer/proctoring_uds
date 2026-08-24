import { createPanelApi } from './panel-api.js';
import { createPanel } from './panel.js';

const bootstrap = document.querySelector('#panel-bootstrap');
const values = {
  apiBaseUrl: bootstrap.dataset.apiBaseUrl,
  moodleOrigin: bootstrap.dataset.moodleOrigin || null
};
bootstrap.remove();

const panel = createPanel({
  api: createPanelApi(values.apiBaseUrl),
  moodleOrigin: values.moodleOrigin,
  root: document.querySelector('#panel-app'),
  liveStatus: document.querySelector('#panel-live-status')
});
void panel.initialize();
