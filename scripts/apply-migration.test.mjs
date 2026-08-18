import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('loads MySQL configuration from the supplied env file before applying a migration', () => {
  const directory = mkdtempSync(join(tmpdir(), 'proctoring-migration-'));
  const envFile = join(directory, 'migration.env');
  writeFileSync(envFile, [
    'MYSQL_HOST=127.0.0.1',
    'MYSQL_PORT=3306abc',
    'MYSQL_DATABASE=proctoring_test',
    'MYSQL_USER=proctoring_test',
    'MYSQL_PASSWORD=proctoring_test'
  ].join('\n'));
  const environment = { ...process.env };
  for (const name of [
    'MYSQL_HOST',
    'MYSQL_PORT',
    'MYSQL_DATABASE',
    'MYSQL_USER',
    'MYSQL_PASSWORD'
  ]) {
    delete environment[name];
  }

  try {
    const result = spawnSync(
      process.execPath,
      [
        `--env-file=${envFile}`,
        'scripts/apply-migration.mjs',
        'apps/api/src/db/migrations/001_sessions.sql'
      ],
      {
        cwd: new URL('..', import.meta.url),
        encoding: 'utf8',
        env: environment
      }
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Configuration error: MYSQL_PORT must be an integer between 1 and 65535/);
    assert.doesNotMatch(result.stderr, /Missing required environment variables/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
