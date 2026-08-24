import { describe, expect, it } from 'vitest';

import { createDetectorWithFallback } from '@/lib/human';

describe('human detector', () => {
  it('falls back to CPU when WebGL initialization fails', async () => {
    const backends = [];
    class FakeHuman {
      constructor(config) {
        backends.push(config.backend);
      }

      async load() {
        if (backends.at(-1) === 'webgl') {
          throw new Error('WebGL context unavailable');
        }
      }
    }

    const detector = await createDetectorWithFallback(FakeHuman);

    expect(detector).toBeInstanceOf(FakeHuman);
    expect(backends).toEqual(['webgl', 'cpu']);
  });
});
