const dependencies = [
  ['PostgreSQL', checkPostgres],
  ['Redis', checkRedis],
  ['MinIO', checkMinio]
];

const postgresPort = process.env.POSTGRES_PORT || '5432';
const redisPort = process.env.REDIS_PORT || '6379';
const minioApiPort = process.env.MINIO_API_PORT || '9000';
const databaseUrl = process.env.DATABASE_URL || `postgresql://${process.env.POSTGRES_USER || 'proctoring'}:${process.env.POSTGRES_PASSWORD || 'proctoring'}@localhost:${postgresPort}/${process.env.POSTGRES_DB || 'proctoring'}`;
const redisUrl = process.env.REDIS_URL || `redis://localhost:${redisPort}`;
const minioEndpoint = process.env.MINIO_ENDPOINT || `http://localhost:${minioApiPort}/minio/health/live`;

async function checkPostgres() {
  const { Client } = await import('pg');
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 3000
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
  } finally {
    await client.end().catch(() => {});
  }
}

async function checkRedis() {
  const { createClient } = await import('redis');
  const client = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 3000,
      reconnectStrategy: false
    }
  });
  client.on('error', () => {});

  try {
    await client.connect();
    await client.ping();
  } finally {
    await client.quit().catch(() => {});
  }
}

async function checkMinio() {
  const response = await fetch(minioEndpoint, { signal: AbortSignal.timeout(3000) });

  if (!response.ok) {
    throw new Error(`received HTTP ${response.status}`);
  }
}

const results = await Promise.allSettled(dependencies.map(([, check]) => check()));
const failedDependencies = results
  .map((result, index) => result.status === 'rejected' ? dependencies[index][0] : null)
  .filter(Boolean);

if (failedDependencies.length > 0) {
  console.error(`Unavailable dependencies: ${failedDependencies.join(', ')}`);
  process.exit(1);
}

console.log('Infrastructure dependencies are available: PostgreSQL, Redis, MinIO');
