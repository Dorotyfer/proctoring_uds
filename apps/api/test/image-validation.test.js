import assert from 'node:assert/strict';
import test from 'node:test';

import { isJpegBuffer } from '../src/services/image-validation.js';

test('accepts a JPEG buffer with the expected start and end markers', () => {
  assert.equal(isJpegBuffer(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9])), true);
});

test('rejects non-JPEG bytes even when the request declares image/jpeg', () => {
  assert.equal(isJpegBuffer(Buffer.from('not-an-image')), false);
  assert.equal(isJpegBuffer(Buffer.from([0xff, 0xd8, 0xff, 0x00])), false);
});
