import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiConfigurationError, createApiConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

const validEnvironment = {
  MOODLE_INTEGRATION_KEY: 'moodle-integration-key',
  WORKER_INTEGRATION_KEY: 'worker-integration-key'
};

test('creates integration configuration from separate Moodle and worker keys', () => {
  assert.deepEqual(createApiConfig(validEnvironment), {
    integrationKey: 'moodle-integration-key',
    preparationWorkerKey: 'worker-integration-key'
  });
});

test('rejects matching Moodle and worker integration keys', () => {
  assert.throws(
    () => createApiConfig({
      MOODLE_INTEGRATION_KEY: 'shared-key',
      WORKER_INTEGRATION_KEY: 'shared-key'
    }),
    ApiConfigurationError
  );
});

test('rejects a missing worker integration key', () => {
  assert.throws(
    () => createApiConfig({ MOODLE_INTEGRATION_KEY: 'moodle-integration-key' }),
    /WORKER_INTEGRATION_KEY/
  );
});

test('application construction requires complete distinct integration configuration', () => {
  const options = { repository: {}, tokenSecret: 'test-token-secret-that-is-long-enough' };

  assert.throws(
    () => createApp({ ...options, environment: { MOODLE_INTEGRATION_KEY: 'moodle-key' } }),
    ApiConfigurationError
  );
  assert.throws(
    () => createApp({
      ...options,
      environment: {
        MOODLE_INTEGRATION_KEY: 'same-key',
        WORKER_INTEGRATION_KEY: 'same-key'
      }
    }),
    ApiConfigurationError
  );
});
