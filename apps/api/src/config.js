export function loadConfig(environment = process.env) {
  const required = [
    'DATABASE_URL',
    'EVIDENCE_ENCRYPTION_KEY',
    'JWT_SECRET',
    'MOODLE_INTEGRATION_KEY',
    'WEB_ORIGIN',
    'API_PUBLIC_URL',
    'PANEL_SSO_SECRET',
    'S3_ENDPOINT',
    'S3_REGION',
    'S3_BUCKET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY'
  ];
  const missing = required.filter((name) => !environment[name]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if ([environment.MOODLE_INTEGRATION_KEY, environment.JWT_SECRET, environment.PANEL_SSO_SECRET]
    .some((secret) => secret.length < 32)) {
    throw new Error('MOODLE_INTEGRATION_KEY, JWT_SECRET and PANEL_SSO_SECRET must contain at least 32 characters');
  }

  const evidenceEncryptionKey = Buffer.from(environment.EVIDENCE_ENCRYPTION_KEY, 'base64');
  if (evidenceEncryptionKey.length !== 32) {
    throw new Error('EVIDENCE_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  }

  let apiOrigin;
  let storageEndpoint;
  let webOrigin;
  try {
    webOrigin = new URL(environment.WEB_ORIGIN).origin;
    apiOrigin = new URL(environment.API_PUBLIC_URL).origin;
    storageEndpoint = new URL(environment.S3_ENDPOINT).toString();
  } catch {
    throw new Error('WEB_ORIGIN, API_PUBLIC_URL and S3_ENDPOINT must be absolute URLs');
  }

  const evidenceRetentionDays = Number(environment.EVIDENCE_RETENTION_DAYS ?? 30);
  if (!Number.isInteger(evidenceRetentionDays) || evidenceRetentionDays < 1 || evidenceRetentionDays > 3650) {
    throw new Error('EVIDENCE_RETENTION_DAYS must be an integer between 1 and 3650');
  }

  const port = Number(environment.PROCTORING_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PROCTORING_PORT must be a valid TCP port');
  }

  const { databaseUrl } = loadDatabaseConfig(environment);

  return {
    apiOrigin,
    databaseUrl,
    evidenceEncryptionKey,
    evidenceRetentionDays,
    host: environment.PROCTORING_HOST ?? '127.0.0.1',
    port,
    moodleIntegrationKey: environment.MOODLE_INTEGRATION_KEY,
    panelSsoSecret: environment.PANEL_SSO_SECRET,
    jwtSecret: environment.JWT_SECRET,
    objectStorage: {
      accessKeyId: environment.S3_ACCESS_KEY_ID,
      bucket: environment.S3_BUCKET,
      endpoint: storageEndpoint,
      forcePathStyle: environment.S3_FORCE_PATH_STYLE === 'true',
      region: environment.S3_REGION,
      serverSideEncryption: environment.S3_SERVER_SIDE_ENCRYPTION === 'none' ? undefined : 'AES256',
      secretAccessKey: environment.S3_SECRET_ACCESS_KEY
    },
    webOrigin
  };
}

export function loadDatabaseConfig(environment = process.env) {
  if (!environment.DATABASE_URL) {
    throw new Error('Missing required environment variable: DATABASE_URL');
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(environment.DATABASE_URL);
  } catch {
    throw new Error('DATABASE_URL must be a valid MySQL/MariaDB URL');
  }
  if (databaseUrl.protocol !== 'mysql:') {
    throw new Error('DATABASE_URL must use the MySQL/MariaDB mysql: protocol');
  }

  return { databaseUrl: environment.DATABASE_URL };
}
