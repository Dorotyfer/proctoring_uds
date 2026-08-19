export function loadPilotConfig(environment) {
  if (!environment.PILOT_API_URL || !environment.MOODLE_INTEGRATION_KEY) {
    throw new Error('PILOT_API_URL and MOODLE_INTEGRATION_KEY are required');
  }
  let apiUrl;
  try {
    const parsed = new URL(environment.PILOT_API_URL);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('unsupported protocol');
    }
    apiUrl = parsed.toString().replace(/\/$/, '');
  } catch {
    throw new Error('PILOT_API_URL must be an absolute HTTP or HTTPS URL');
  }

  return {
    apiUrl,
    concurrency: boundedInteger(environment.PILOT_CONCURRENCY ?? '50', 1, 200, 'PILOT_CONCURRENCY'),
    integrationKey: environment.MOODLE_INTEGRATION_KEY,
    maxRetries: boundedInteger(environment.PILOT_MAX_RETRIES ?? '2', 0, 5, 'PILOT_MAX_RETRIES'),
    seed: environment.PILOT_SEED ?? 'acceptance',
    sessions: boundedInteger(environment.PILOT_SESSIONS ?? '1000', 1, 1000, 'PILOT_SESSIONS')
  };
}

function boundedInteger(value, minimum, maximum, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}
