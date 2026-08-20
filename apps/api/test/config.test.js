import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig, loadDatabaseConfig } from '../src/config.js';

const validEnvironment = {
  API_PUBLIC_URL: 'https://api.proctoring.example.edu',
  DATABASE_URL: 'mysql://service-host:password@127.0.0.1:3306/proctoring',
  EVIDENCE_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  MOODLE_INTEGRATION_KEY: 'moodle-integration-key-with-32-characters',
  JWT_SECRET: 'browser-token-secret-with-32-characters',
  PANEL_SSO_SECRET: 'panel-sso-secret-with-at-least-32-characters',
  S3_ACCESS_KEY_ID: 'access-key',
  S3_BUCKET: 'evidence',
  S3_ENDPOINT: 'https://s3.example.edu',
  S3_REGION: 'us-east-1',
  S3_SECRET_ACCESS_KEY: 'secret-key',
  WEB_ORIGIN: 'https://proctoring.example.edu'
};

test('loads independent service configuration', () => {
  const config = loadConfig(validEnvironment);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3001);
  assert.equal(config.evidenceRetentionDays, 30);
  assert.equal(config.objectStorage.serverSideEncryption, 'AES256');
});

test('allows local object storage without bucket-side encryption', () => {
  const config = loadConfig({
    ...validEnvironment,
    S3_SERVER_SIDE_ENCRYPTION: 'none'
  });

  assert.equal(config.objectStorage.serverSideEncryption, undefined);
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

test('rejects non-MySQL database URLs', () => {
  assert.throws(() => loadDatabaseConfig({
    DATABASE_URL: 'postgres://service-host/proctoring'
  }), /MySQL\/MariaDB/);
});
