export function loadConfig(environment = process.env) {
  const required = ['DATABASE_URL', 'MOODLE_INTEGRATION_KEY', 'JWT_SECRET'];
  const missing = required.filter((name) => !environment[name]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (environment.MOODLE_INTEGRATION_KEY.length < 32 || environment.JWT_SECRET.length < 32) {
    throw new Error('MOODLE_INTEGRATION_KEY and JWT_SECRET must contain at least 32 characters');
  }

  const port = Number(environment.PROCTORING_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PROCTORING_PORT must be a valid TCP port');
  }

  return {
    databaseUrl: environment.DATABASE_URL,
    host: environment.PROCTORING_HOST ?? '127.0.0.1',
    port,
    moodleIntegrationKey: environment.MOODLE_INTEGRATION_KEY,
    jwtSecret: environment.JWT_SECRET
  };
}

export function loadDatabaseConfig(environment = process.env) {
  if (!environment.DATABASE_URL) {
    throw new Error('Missing required environment variable: DATABASE_URL');
  }

  return { databaseUrl: environment.DATABASE_URL };
}
