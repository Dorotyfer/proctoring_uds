export async function runLoadScenario(options) {
  validateOptions(options);
  const result = {
    completed: 0,
    errors: {},
    failed: 0,
    latencyMs: { p50: 0, p95: 0, p99: 0 },
    responseBytes: 0,
    retries: 0,
    statusCodes: {}
  };
  const latencies = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < options.items.length) {
      const item = options.items[nextIndex];
      nextIndex += 1;
      const startedAt = performance.now();
      let attempt = 0;
      while (attempt <= options.maxRetries) {
        try {
          const response = await options.operation(item);
          result.completed += 1;
          result.responseBytes += response.bytes ?? 0;
          const statusCode = String(response.statusCode ?? 0);
          result.statusCodes[statusCode] = (result.statusCodes[statusCode] ?? 0) + 1;
          latencies.push(performance.now() - startedAt);
          break;
        } catch (error) {
          if (attempt === options.maxRetries) {
            const message = error instanceof Error ? error.message : 'unknown';
            result.errors[message] = (result.errors[message] ?? 0) + 1;
            result.failed += 1;
            latencies.push(performance.now() - startedAt);
            break;
          }
          result.retries += 1;
          attempt += 1;
        }
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(options.concurrency, options.items.length) },
    () => worker()
  );
  await Promise.all(workers);
  result.latencyMs = {
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99)
  };
  return result;
}

function validateOptions(options) {
  if (!Array.isArray(options.items) || options.items.length === 0) {
    throw new Error('Load scenario requires at least one item');
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error('Load scenario concurrency must be a positive integer');
  }
  if (!Number.isInteger(options.maxRetries) || options.maxRetries < 0) {
    throw new Error('Load scenario maxRetries must be a non-negative integer');
  }
  if (typeof options.operation !== 'function') {
    throw new Error('Load scenario operation must be a function');
  }
}

function percentile(values, percentage) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil((percentage / 100) * sorted.length) - 1);
  return Number(sorted[index].toFixed(2));
}
