import { describe, expect, it } from 'vitest';

import {
  BIOMETRIC_DESCRIPTOR_LENGTH,
  createLivenessChallenge,
  describeFaceState,
  evaluateChallengeStep,
  extractFaceEmbedding
} from '@/lib/face-analysis';

describe('face analysis', () => {
  it('requires one sufficiently framed face', () => {
    expect(describeFaceState({ face: [] }, { width: 640, height: 480 }).state).toBe('absent');
    expect(describeFaceState({ face: [{}, {}] }, { width: 640, height: 480 }).state).toBe('multiple');
    expect(describeFaceState({ face: [{ box: [160, 80, 220, 280] }] }, { width: 640, height: 480 }).state).toBe('valid');
  });

  it('generates two unique challenge steps', () => {
    const challenge = createLivenessChallenge(7);
    expect(challenge).toHaveLength(2);
    expect(new Set(challenge).size).toBe(2);
  });

  it('detects deliberate head turns', () => {
    expect(evaluateChallengeStep('turn-left', { rotation: { angle: { yaw: -0.5 } } }).passed).toBe(true);
    expect(evaluateChallengeStep('turn-right', { rotation: { angle: { yaw: 0.5 } } }).passed).toBe(true);
  });

  it('extracts only complete finite face embeddings', () => {
    const embedding = Array.from({ length: BIOMETRIC_DESCRIPTOR_LENGTH }, () => 0.1);

    expect(extractFaceEmbedding({ embedding })).toEqual(embedding);
    expect(extractFaceEmbedding({ embedding: embedding.slice(1) })).toBeNull();
    expect(extractFaceEmbedding({ embedding: embedding.map(() => Number.NaN) })).toBeNull();
  });
});
