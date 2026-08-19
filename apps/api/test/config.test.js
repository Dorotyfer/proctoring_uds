import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig, loadDatabaseConfig } from '../src/config.js';

const validEnvironment = {
  DATABASE_URL: 'postgres://service-host/proctoring',
  MOODLE_INTEGRATION_KEY: 'moodle-integration-key-with-32-characters',
  JWT_SECRET: 'browser-token-secret-with-32-characters'
};

test('loads independent service configuration', () => {
  const config = loadConfig(validEnvironment);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3001);
});

test('rejects missing or weak service secrets', () => {
  assert.throws(() => loadConfig({}));
  assert.throws(() => loadConfig({
    ...validEnvironment,
    JWT_SECRET: 'short'
  }));
});

test('allows migrations with only the external database URL', () => {
  assert.deepEqual(loadDatabaseConfig({ DATABASE_URL: validEnvironment.DATABASE_URL }), {
    databaseUrl: validEnvironment.DATABASE_URL
  });
});
