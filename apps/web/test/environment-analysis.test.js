import { describe, expect, it } from 'vitest';

import { createEnvironmentTracker, normalizeDetection } from '@/lib/environment-analysis';

describe('environment analysis', () => {
  it('normalizes supported object metadata to a bounded box', () => {
    expect(normalizeDetection({
      box: [-2, 10, 200, 300],
      confidence: 0.91234,
      objectType: 'phone'
    }, 1000, 1000)).toEqual({
      box: { height: 0.3, width: 0.2, x: 0, y: 0.01 },
      confidence: 0.91,
      objectCount: 1,
      objectType: 'phone'
    });
  });

  it('requires consecutive alertable detections and ignores allowed objects', () => {
    const tracker = createEnvironmentTracker({
      allowedObjects: ['document'],
      alertableObjects: ['phone'],
      consecutiveDetections: 3
    });
    const detection = { box: [10, 20, 30, 40], confidence: 0.8, label: 'phone' };

    expect(tracker.update([detection], 100, 100)).toBeNull();
    expect(tracker.update([detection], 100, 100)).toBeNull();
    expect(tracker.update([detection], 100, 100)).toMatchObject({ objectType: 'phone', objectCount: 1 });
    expect(tracker.update([{ ...detection, label: 'document' }], 100, 100)).toBeNull();
  });
});
