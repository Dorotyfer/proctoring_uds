import assert from 'node:assert/strict';
import test from 'node:test';

import { runLoadScenario } from '../src/pilot/load-runner.js';

test('measures concurrency, retries, response bytes and latency percentiles', async () => {
  const attempts = new Map();
  let active = 0;
  let maximumActive = 0;
  const result = await runLoadScenario({
    concurrency: 2,
    items: ['a', 'b', 'c'],
    maxRetries: 1,
    operation: async (item) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      attempts.set(item, (attempts.get(item) ?? 0) + 1);
      await new Promise((resolve) => setTimeout(resolve, item === 'a' ? 8 : 2));
      active -= 1;
      if (item === 'b' && attempts.get(item) === 1) {
        throw new Error('temporary');
      }
      return { bytes: item.charCodeAt(0), statusCode: 201 };
    }
  });

  assert.equal(maximumActive, 2);
  assert.equal(result.completed, 3);
  assert.equal(result.failed, 0);
  assert.equal(result.retries, 1);
  assert.equal(result.responseBytes, 294);
  assert.equal(result.statusCodes['201'], 3);
  assert.ok(result.latencyMs.p50 >= 0);
  assert.ok(result.latencyMs.p95 >= result.latencyMs.p50);
  assert.ok(result.latencyMs.p99 >= result.latencyMs.p95);
});

test('reports terminal failures without stopping other load operations', async () => {
  const result = await runLoadScenario({
    concurrency: 2,
    items: ['ok', 'failed'],
    maxRetries: 0,
    operation: async (item) => {
      if (item === 'failed') {
        throw new Error('unavailable');
      }
      return { bytes: 10, statusCode: 200 };
    }
  });

  assert.equal(result.completed, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.errors.unavailable, 1);
});
