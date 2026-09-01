import assert from 'node:assert/strict';
import test from 'node:test';

import { loadPilotConfig } from '../src/pilot/pilot-config.js';

test('loads bounded pilot load settings from the environment', () => {
  assert.deepEqual(loadPilotConfig({
    MOODLE_INTEGRATION_KEY: 'integration-key',
    PILOT_API_URL: 'https://api.example.edu/',
    PILOT_CONCURRENCY: '25',
    PILOT_MAX_RETRIES: '3',
    PILOT_SEED: 'acceptance-01',
    PILOT_SESSIONS: '1000'
  }), {
    apiUrl: 'https://api.example.edu',
    concurrency: 25,
    integrationKey: 'integration-key',
    maxRetries: 3,
    seed: 'acceptance-01',
    sessions: 1000
  });
});

test('rejects unsafe or incomplete pilot load settings', () => {
  assert.throws(() => loadPilotConfig({}));
  assert.throws(() => loadPilotConfig({
    MOODLE_INTEGRATION_KEY: 'key',
    PILOT_API_URL: 'https://api.example.edu',
    PILOT_CONCURRENCY: '0'
  }));
  assert.throws(() => loadPilotConfig({
    MOODLE_INTEGRATION_KEY: 'key',
    PILOT_API_URL: 'not-a-url'
  }));
});
