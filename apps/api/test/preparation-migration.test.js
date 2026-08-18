import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../src/db/migrations/004_preparation_verifications.sql', import.meta.url);

test('migration backfills legacy preparation submissions before requiring a submission ID', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.match(
    migration,
    /UPDATE proctoring_preparation_submissions\s+SET submission_id = UUID\(\)\s+WHERE submission_id IS NULL/i
  );
  assert.match(
    migration,
    /MODIFY COLUMN submission_id CHAR\(36\) NOT NULL/i
  );
});
