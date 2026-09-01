import assert from 'node:assert/strict';
import test from 'node:test';

import { maskStudentDocument } from '../src/repositories/panel-repository.js';

test('masks all but the final four document characters in panel lists', () => {
  assert.equal(maskStudentDocument('1234567'), '•••4567');
  assert.equal(maskStudentDocument('ABC'), 'ABC');
  assert.equal(maskStudentDocument(null), null);
});
