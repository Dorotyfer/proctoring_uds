import { afterEach, expect, it, vi } from 'vitest';

import { captureReference } from '@/lib/camera';

afterEach(() => {
  vi.restoreAllMocks();
});

it('reduces a large JPEG capture before returning it', () => {
  const large = `data:image/jpeg;base64,${'A'.repeat(300000)}`;
  const small = 'data:image/jpeg;base64,anBlZw==';
  const canvas = {
    getContext: vi.fn(() => ({ drawImage: vi.fn() })),
    toDataURL: vi.fn()
      .mockReturnValueOnce(large)
      .mockReturnValueOnce(small)
  };
  vi.spyOn(document, 'createElement').mockReturnValue(canvas);

  const result = captureReference({ videoHeight: 480, videoWidth: 640 });

  expect(result).toBe(small);
  expect(canvas.toDataURL).toHaveBeenCalledTimes(2);
});

it('returns no capture when the camera cannot produce a JPEG under the limit', () => {
  const canvas = {
    getContext: vi.fn(() => ({ drawImage: vi.fn() })),
    toDataURL: vi.fn(() => `data:image/jpeg;base64,${'A'.repeat(300000)}`)
  };
  vi.spyOn(document, 'createElement').mockReturnValue(canvas);

  expect(captureReference({ videoHeight: 480, videoWidth: 640 })).toBeNull();
});
