import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('reports MySQL when the configured database is unavailable', () => {
  const result = spawnSync(process.execPath, ['scripts/check-infra.mjs'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      MYSQL_HOST: '127.0.0.1',
      MYSQL_PORT: '1',
      MYSQL_DATABASE: 'proctoring_test',
      MYSQL_USER: 'proctoring_test',
      MYSQL_PASSWORD: 'proctoring_test'
    }
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unavailable dependencies: MySQL/);
});
