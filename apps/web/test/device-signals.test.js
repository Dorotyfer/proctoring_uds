import { describe, expect, it, vi } from 'vitest';

import { createDeviceSignalMonitor } from '@/lib/device-signals';

function createEventTarget() {
  const target = new EventTarget();
  return target;
}

describe('createDeviceSignalMonitor', () => {
  it('emits browser device signals with recovery duration and removes listeners', () => {
    vi.useFakeTimers();
    const documentRef = createEventTarget();
    Object.defineProperty(documentRef, 'hidden', { configurable: true, value: true });
    Object.defineProperty(documentRef, 'fullscreenElement', { configurable: true, value: null });
    const windowRef = createEventTarget();
    const emit = vi.fn();
    const monitor = createDeviceSignalMonitor({ emit, documentRef, windowRef, now: () => 2000 });

    monitor.start();
    documentRef.dispatchEvent(new Event('visibilitychange'));
    windowRef.dispatchEvent(new Event('blur'));
    windowRef.dispatchEvent(new Event('focus'));
    documentRef.dispatchEvent(new Event('fullscreenchange'));
    windowRef.dispatchEvent(new Event('offline'));
    windowRef.dispatchEvent(new Event('online'));

    expect(emit).toHaveBeenCalledWith('page_visibility_changed', expect.objectContaining({ source: 'browser', hidden: true }));
    expect(emit).toHaveBeenCalledWith('window_blur', expect.objectContaining({ source: 'browser' }));
    expect(emit).toHaveBeenCalledWith('window_focus', expect.objectContaining({ source: 'browser' }));
    expect(emit).toHaveBeenCalledWith('fullscreen_exit', expect.objectContaining({ source: 'browser' }));
    expect(emit).toHaveBeenCalledWith('network_disconnected', expect.objectContaining({ source: 'browser' }));
    expect(emit).toHaveBeenCalledWith('network_reconnected', expect.objectContaining({ source: 'browser' }));

    monitor.stop();
    emit.mockClear();
    windowRef.dispatchEvent(new Event('blur'));
    expect(emit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
