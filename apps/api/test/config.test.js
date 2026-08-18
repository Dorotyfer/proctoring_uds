import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiConfigurationError, createApiConfig } from '../src/config.js';

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
