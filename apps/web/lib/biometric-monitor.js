import { extractFaceEmbedding } from './face-analysis';

const DEFAULT_INTERVAL_MS = 30000;
const MIN_INTERVAL_MS = 15000;
const MAX_INTERVAL_MS = 120000;

export function createBiometricMonitor({
  detector,
  getVideo,
  sendCheck,
  intervalMs = DEFAULT_INTERVAL_MS,
  sampleCount = 3,
  onResult = () => {},
  getCapture = null,
  now = () => Date.now(),
  sampleSpacingMs = 0
}) {
  if (!Number.isInteger(intervalMs) || intervalMs < MIN_INTERVAL_MS || intervalMs > MAX_INTERVAL_MS) {
    throw new RangeError(`intervalMs must be between ${MIN_INTERVAL_MS} and ${MAX_INTERVAL_MS}`);
  }
  if (sampleCount !== 3) {
    throw new RangeError('sampleCount must be 3');
  }

  let timer = null;
  let running = false;
  let checking = false;
  let currentState = 'stopped';
  let lastResult = null;

  async function collect() {
    if (!running || checking) {
      return;
    }
    checking = true;
    currentState = 'checking';
    try {
      const samples = [];
      for (let index = 0; index < sampleCount; index += 1) {
        const sample = await readEmbedding(detector, getVideo());
        if (!sample) {
          lastResult = { status: 'unavailable' };
          currentState = 'unavailable';
          await onResult(lastResult);
          return;
        }
        samples.push(sample);
        if (index < sampleCount - 1 && sampleSpacingMs > 0) {
          await wait(sampleSpacingMs);
        }
      }

      const capture = typeof getCapture === 'function' ? await getCapture() : undefined;
      lastResult = await sendCheck({
        clientCheckId: createClientCheckId(),
        occurredAt: new Date(now()).toISOString(),
        samples,
        ...(capture ? { capture } : {})
      });
      currentState = lastResult?.status ?? 'unavailable';
      await onResult(lastResult);
    } catch (error) {
      lastResult = { status: 'unavailable', error };
      currentState = 'unavailable';
      await onResult(lastResult);
    } finally {
      checking = false;
      if (running && currentState === 'checking') {
        currentState = 'active';
      }
    }
  }

  return {
    start() {
      if (running) {
        return;
      }
      running = true;
      currentState = 'active';
      timer = setInterval(() => void collect(), intervalMs);
    },
    stop() {
      running = false;
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      currentState = 'stopped';
    },
    state() {
      return {
        lastResult,
        running,
        status: currentState
      };
    }
  };
}

async function readEmbedding(detector, video) {
  const result = typeof detector === 'function'
    ? await detector(video)
    : await detector.detect(video);
  if (Array.isArray(result) && result.length === 1024) {
    return result.slice();
  }
  const faces = result?.face ?? [];
  return faces.length === 1 ? extractFaceEmbedding(faces[0]) : null;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createClientCheckId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
