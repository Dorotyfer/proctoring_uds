import assert from 'node:assert/strict';
import test from 'node:test';

import { createInfrastructureConfig } from './mysql-config.mjs';

const validEnvironment = {
  MYSQL_HOST: 'db.internal',
  MYSQL_PORT: '3306',
  MYSQL_DATABASE: 'proctoring',
  MYSQL_USER: 'proctoring',
  MYSQL_PASSWORD: 'local-password',
  EVIDENCE_STORAGE_PATH: '/srv/proctoring/evidence',
  APACHE_DOCUMENT_ROOTS: '/var/www/html'
};

function createFileSystem({ writable = true } = {}) {
  return {
    constants: { W_OK: 2 },
    async realpath(path) {
      return path;
    },
    async stat() {
      return { isDirectory: () => true };
    },
    async access() {
      if (!writable) {
        throw new Error('permission denied');
      }
    }
  };
}

test('creates a MySQL configuration only from complete explicit environment values', async () => {
  const config = await createInfrastructureConfig(validEnvironment, {
    fileSystem: createFileSystem(),
    pathDelimiter: ':'
  });

  assert.deepEqual(config.mysql, {
    host: 'db.internal',
    port: 3306,
    user: 'proctoring',
    password: 'local-password',
    database: 'proctoring',
    connectTimeout: 3000
  });
  assert.equal(config.evidenceStoragePath, '/srv/proctoring/evidence');
});

test('rejects an evidence directory that is not writable by the API worker', async () => {
  await assert.rejects(
    createInfrastructureConfig(validEnvironment, {
      fileSystem: createFileSystem({ writable: false }),
      pathDelimiter: ':'
    }),
    /EVIDENCE_STORAGE_PATH must be writable by the API worker/
  );
});
