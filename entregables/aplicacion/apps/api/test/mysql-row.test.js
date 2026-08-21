import assert from 'node:assert/strict';
import test from 'node:test';

import { parseJson, toIsoDate, toMysqlDate } from '../src/db/mysql-row.js';

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

test('formats ISO timestamps for MariaDB DATETIME columns', () => {
  assert.equal(toMysqlDate('2026-08-20T12:30:00.123Z'), '2026-08-20 12:30:00.123');
  assert.throws(() => toMysqlDate('not-a-date'), /valid date/);
});
