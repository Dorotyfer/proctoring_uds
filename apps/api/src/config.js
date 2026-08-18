export class ApiConfigurationError extends Error {}

function readRequiredKey(environment, name) {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiConfigurationError(`${name} must be configured`);
  }
  return value;
}

export function createApiConfig(environment = process.env) {
  const integrationKey = readRequiredKey(environment, 'MOODLE_INTEGRATION_KEY');
  const preparationWorkerKey = readRequiredKey(environment, 'WORKER_INTEGRATION_KEY');

  if (integrationKey === preparationWorkerKey) {
    throw new ApiConfigurationError(
      'MOODLE_INTEGRATION_KEY and WORKER_INTEGRATION_KEY must be distinct'
    );
  }

  return { integrationKey, preparationWorkerKey };
}
