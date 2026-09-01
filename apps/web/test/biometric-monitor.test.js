import { describe, expect, it, vi } from 'vitest';

import { createBiometricMonitor } from '@/lib/biometric-monitor';

function embedding(value) {
  return Array.from({ length: 1024 }, () => value);
}

describe('createBiometricMonitor', () => {
  it('collects three temporary embeddings on the configured interval', async () => {
    vi.useFakeTimers();
    const sendCheck = vi.fn().mockResolvedValue({ status: 'matched', similarity: 0.91 });
    const detector = vi.fn().mockResolvedValue(embedding(0.1));
    const monitor = createBiometricMonitor({
      detector,
      getVideo: () => ({}),
      intervalMs: 15000,
      sendCheck,
      now: () => Date.parse('2026-08-28T12:00:00.000Z')
    });

    monitor.start();
    await vi.advanceTimersByTimeAsync(15000);

    expect(sendCheck).toHaveBeenCalledTimes(1);
    expect(sendCheck.mock.calls[0][0].samples).toHaveLength(3);
    expect(sendCheck.mock.calls[0][0].samples[0]).toHaveLength(1024);
    expect(monitor.state().status).toBe('matched');
    monitor.stop();
    vi.useRealTimers();
  });

  it('reports unavailable without sending partial samples and stops cleanly', async () => {
    vi.useFakeTimers();
    const sendCheck = vi.fn();
    const onResult = vi.fn();
    const monitor = createBiometricMonitor({
      detector: vi.fn().mockResolvedValue({ face: [] }),
      getVideo: () => ({}),
      intervalMs: 15000,
      onResult,
      sendCheck
    });

    monitor.start();
    await vi.advanceTimersByTimeAsync(15000);
    monitor.stop();
    await vi.advanceTimersByTimeAsync(30000);

    expect(sendCheck).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ status: 'unavailable' }));
    expect(monitor.state().running).toBe(false);
    vi.useRealTimers();
  });

  it('rejects intervals outside the safe monitoring range', () => {
    expect(() => createBiometricMonitor({
      detector: () => embedding(0.1),
      getVideo: () => ({}),
      intervalMs: 10000,
      sendCheck: vi.fn()
    })).toThrow(RangeError);
  });
});
