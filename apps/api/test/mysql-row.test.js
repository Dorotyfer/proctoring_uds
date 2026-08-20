import assert from 'node:assert/strict';
import test from 'node:test';

import { parseJson, toIsoDate } from '../src/db/mysql-row.js';

test('parses MariaDB JSON strings and preserves JSON values', () => {
  assert.deepEqual(parseJson('{"faceCount":1}'), { faceCount: 1 });
  assert.deepEqual(parseJson({ faceCount: 1 }), { faceCount: 1 });
  assert.equal(parseJson(null), null);
});

test('emits MariaDB datetime values as ISO timestamps', () => {
  assert.equal(toIsoDate(new Date('2026-08-20T12:30:00.000Z')), '2026-08-20T12:30:00.000Z');
  assert.equal(toIsoDate('2026-08-20T12:30:00.000Z'), '2026-08-20T12:30:00.000Z');
  assert.throws(() => toIsoDate('not-a-date'), /valid date/);
});
