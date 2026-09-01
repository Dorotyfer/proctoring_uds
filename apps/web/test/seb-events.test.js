import { afterEach, expect, it, vi } from 'vitest';

import { getSafeExamBrowserMetadata } from '@/lib/seb-events';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('returns the Safe Exam Browser version when its JavaScript API is present', () => {
  vi.stubGlobal('SafeExamBrowser', { version: 'SafeExamBrowser_Windows_3.10.1' });

  expect(getSafeExamBrowserMetadata()).toEqual({
    source: 'safe-exam-browser',
    version: 'SafeExamBrowser_Windows_3.10.1'
  });
});

it('returns null outside Safe Exam Browser', () => {
  expect(getSafeExamBrowserMetadata()).toBeNull();
});
