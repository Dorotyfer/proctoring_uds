import { describe, expect, it } from 'vitest';

import { createFacialPatternTracker, normalizeFacialPattern } from '@/lib/facial-pattern-analysis';

describe('facial pattern analysis', () => {
  it('maps model expressions to technical categories without exposing raw names', () => {
    expect(normalizeFacialPattern({ expression: 'happy', confidence: 0.9, modelVersion: 'human-3.3.6' }))
      .toEqual({ category: 'positive', confidence: 0.9, modelVersion: 'human-3.3.6' });
    expect(normalizeFacialPattern({ expression: 'fear', confidence: 0.8, modelVersion: 'human-3.3.6' }).category)
      .toBe('uncertain');
  });

  it('emits only after the configured persistence and ignores low confidence', () => {
    let currentTime = 0;
    const tracker = createFacialPatternTracker({ persistenceMs: 30000, now: () => currentTime });

    expect(tracker.update({ expression: 'happy', confidence: 0.9, modelVersion: 'v1' })).toBeNull();
    currentTime = 29999;
    expect(tracker.update({ expression: 'happy', confidence: 0.9, modelVersion: 'v1' })).toBeNull();
    currentTime = 30000;
    expect(tracker.update({ expression: 'happy', confidence: 0.9, modelVersion: 'v1' }))
      .toEqual({ category: 'positive', confidence: 0.9, modelVersion: 'v1' });
    currentTime = 60000;
    expect(tracker.update({ expression: 'happy', confidence: 0.9, modelVersion: 'v1' })).toBeNull();
    expect(tracker.update({ expression: 'sad', confidence: 0.5, modelVersion: 'v1' })).toBeNull();
  });
});
