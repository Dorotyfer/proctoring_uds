export const BIOMETRIC_DESCRIPTOR_LENGTH = 1024;
export const BIOMETRIC_SAMPLE_COUNT = 3;
export const DEFAULT_BIOMETRIC_THRESHOLD = 0.5;

export function validateBiometricSamples(samples) {
  if (!Array.isArray(samples) || samples.length !== BIOMETRIC_SAMPLE_COUNT) {
    throw new TypeError(`Exactly ${BIOMETRIC_SAMPLE_COUNT} biometric samples are required`);
  }

  return samples.map((sample) => {
    if (!Array.isArray(sample) || sample.length !== BIOMETRIC_DESCRIPTOR_LENGTH) {
      throw new TypeError(`Biometric descriptor length must be ${BIOMETRIC_DESCRIPTOR_LENGTH}`);
    }
    if (sample.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      throw new TypeError('Biometric descriptor values must be finite');
    }
    return sample.slice();
  });
}

export function compareBiometricSamples(samples, reference, threshold = DEFAULT_BIOMETRIC_THRESHOLD) {
  const validatedSamples = validateBiometricSamples(samples);
  const [validatedReference] = validateBiometricSamples([reference, reference, reference]);
  const similarities = validatedSamples.map((sample) => descriptorSimilarity(sample, validatedReference));
  const mismatchedSamples = similarities.filter((value) => value < threshold).length;

  return {
    mismatchedSamples,
    similarity: roundSimilarity(Math.min(...similarities)),
    similarities,
    status: mismatchedSamples === BIOMETRIC_SAMPLE_COUNT ? 'mismatch' : 'matched'
  };
}

export function selectStableDescriptor(samples) {
  const validatedSamples = validateBiometricSamples(samples);
  let selected = validatedSamples[0];
  let lowestDistance = Number.POSITIVE_INFINITY;

  validatedSamples.forEach((candidate, candidateIndex) => {
    const totalDistance = validatedSamples.reduce((total, other, otherIndex) => {
      return candidateIndex === otherIndex ? total : total + euclideanDistance(candidate, other);
    }, 0);
    if (totalDistance < lowestDistance) {
      lowestDistance = totalDistance;
      selected = candidate;
    }
  });

  return selected;
}

function descriptorSimilarity(first, second) {
  const distance = 25 * euclideanDistance(first, second) ** 2;
  if (distance === 0) {
    return 1;
  }

  const normalized = (1 - Math.sqrt(distance) / 100 - 0.2) / 0.6;
  return Math.max(0, Math.min(1, Math.round(normalized * 100) / 100));
}

function euclideanDistance(first, second) {
  let sum = 0;
  for (let index = 0; index < first.length; index += 1) {
    const difference = first[index] - second[index];
    sum += difference * difference;
  }
  return Math.sqrt(sum);
}

function roundSimilarity(value) {
  return Math.round(value * 100) / 100;
}
