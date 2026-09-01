import { expect, it } from 'vitest';

import { createAttentionSignalTracker } from '@/lib/monitor-state';

it('throttles repeated attention observations', () => {
  const tracker = createAttentionSignalTracker(10000);
  const signal = { signal: 'facial_expression_observation', expression: 'neutral', confidence: 0.91 };

  expect(tracker.update(signal, 1000)).toBe('attention_signal');
  expect(tracker.update(signal, 5000)).toBeNull();
  expect(tracker.update(signal, 11001)).toBe('attention_signal');
});
