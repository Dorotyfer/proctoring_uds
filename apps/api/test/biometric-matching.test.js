import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BIOMETRIC_DESCRIPTOR_LENGTH,
  compareBiometricSamples,
  selectStableDescriptor,
  validateBiometricSamples
} from '../src/services/biometric-matching-service.js';

function descriptor(value) {
  return Array.from({ length: BIOMETRIC_DESCRIPTOR_LENGTH }, () => value);
}

test('accepts exactly three finite Human descriptors', () => {
  const samples = [descriptor(0.1), descriptor(0.1), descriptor(0.1)];

  assert.deepEqual(validateBiometricSamples(samples), samples);
});

test('rejects descriptors with the wrong length or non-finite values', () => {
  assert.throws(() => validateBiometricSamples([
    descriptor(0.1),
    Array.from({ length: BIOMETRIC_DESCRIPTOR_LENGTH - 1 }, () => 0.1),
    descriptor(0.1)
  ]), /descriptor length/);
  assert.throws(() => validateBiometricSamples([
    descriptor(0.1),
    descriptor(Number.NaN),
    descriptor(0.1)
  ]), /finite/);
});

test('classifies three matching samples as a match', () => {
  const reference = descriptor(0.1);
  const result = compareBiometricSamples([
    descriptor(0.1),
    descriptor(0.1),
    descriptor(0.1)
  ], reference, 0.5);

  assert.equal(result.status, 'matched');
  assert.equal(result.mismatchedSamples, 0);
  assert.equal(result.similarity, 1);
});

test('classifies three non-matching samples as a mismatch', () => {
  const result = compareBiometricSamples([
    descriptor(0.9),
    descriptor(0.9),
    descriptor(0.9)
  ], descriptor(0.1), 0.5);

  assert.equal(result.status, 'mismatch');
  assert.equal(result.mismatchedSamples, 3);
  assert.equal(result.similarity, 0);
});

test('selects the most stable descriptor without averaging biometric values', () => {
  const samples = [descriptor(0), descriptor(0.1), descriptor(0.2)];

  assert.deepEqual(selectStableDescriptor(samples), samples[1]);
});
