import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function createSafeEnvironment() {
  const directory = mkdtempSync(join(tmpdir(), 'proctoring-infra-'));
  const evidencePath = join(directory, 'evidence');
  const apacheDocumentRoot = join(directory, 'apache-public');
  mkdirSync(evidencePath);
  mkdirSync(apacheDocumentRoot);

  return {
    directory,
    environment: {
      MYSQL_HOST: '127.0.0.1',
      MYSQL_PORT: '1',
      MYSQL_DATABASE: 'proctoring_test',
      MYSQL_USER: 'proctoring_test',
      MYSQL_PASSWORD: 'proctoring_test',
      EVIDENCE_STORAGE_PATH: evidencePath,
      APACHE_DOCUMENT_ROOTS: apacheDocumentRoot
    }
  };
}

function runCheck(environment) {
  return spawnSync(process.execPath, ['scripts/check-infra.mjs'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...environment
    }
  });
}

test('reports missing MySQL configuration before attempting a connection', () => {
  const result = runCheck({
    MYSQL_HOST: '',
    MYSQL_PORT: '',
    MYSQL_DATABASE: '',
    MYSQL_USER: '',
    MYSQL_PASSWORD: '',
    EVIDENCE_STORAGE_PATH: '',
    APACHE_DOCUMENT_ROOTS: ''
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Configuration error: Missing required environment variables:/);
  assert.match(result.stderr, /MYSQL_HOST/);
  assert.doesNotMatch(result.stderr, /Unavailable dependencies/);
});

test('rejects a MySQL port that is not a complete decimal port number', () => {
  const { directory, environment } = createSafeEnvironment();
  try {
    const result = runCheck({ ...environment, MYSQL_PORT: '3306abc' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Configuration error: MYSQL_PORT must be an integer between 1 and 65535/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects a missing evidence directory', () => {
  const { directory, environment } = createSafeEnvironment();
  try {
    const result = runCheck({
      ...environment,
      EVIDENCE_STORAGE_PATH: join(directory, 'missing-evidence')
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Configuration error: EVIDENCE_STORAGE_PATH must exist and be a directory/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects evidence stored under a configured Apache public path', () => {
  const { directory, environment } = createSafeEnvironment();
  const publicEvidencePath = join(environment.APACHE_DOCUMENT_ROOTS, 'evidence');
  mkdirSync(publicEvidencePath);

  try {
    const result = runCheck({ ...environment, EVIDENCE_STORAGE_PATH: publicEvidencePath });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Configuration error: EVIDENCE_STORAGE_PATH must be outside APACHE_DOCUMENT_ROOTS/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('reports MySQL when all required configuration is valid but the database is unavailable', () => {
  const { directory, environment } = createSafeEnvironment();
  try {
    const result = runCheck(environment);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unavailable dependencies: MySQL/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
