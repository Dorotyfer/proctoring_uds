import { createApiLoadOperation } from './api-load-scenario.js';
import { runLoadScenario } from './load-runner.js';
import { loadPilotConfig } from './pilot-config.js';
import { createPilotFixtures } from './pilot-fixtures.js';

const config = loadPilotConfig(process.env);
const issuedAt = new Date(Date.now() - 60 * 1000).toISOString();
const fixtures = createPilotFixtures({
  count: config.sessions,
  issuedAt,
  seed: config.seed
});
const operation = createApiLoadOperation({
  apiUrl: config.apiUrl,
  integrationKey: config.integrationKey,
  referenceCapture: 'data:image/jpeg;base64,/9j/2Q=='
});
const startedAt = performance.now();
const result = await runLoadScenario({
  concurrency: config.concurrency,
  items: fixtures,
  maxRetries: config.maxRetries,
  operation
});
const elapsedMs = performance.now() - startedAt;

const report = {
  ...result,
  concurrency: config.concurrency,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  requestedSessions: config.sessions,
  responseMegabytes: Number((result.responseBytes / 1024 / 1024).toFixed(2)),
  sessionsPerSecond: Number((result.completed / (elapsedMs / 1000)).toFixed(2))
};
console.log(JSON.stringify(report, null, 2));
if (result.failed > 0) {
  process.exitCode = 1;
}
