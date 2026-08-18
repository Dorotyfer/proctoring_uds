const dependencies = [
  ['PostgreSQL', checkPostgres],
  ['Redis', checkRedis],
  ['MinIO', checkMinio]
];

async function checkPostgres() {
  const { Client } = await import('pg');
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://proctoring:proctoring@localhost:5432/proctoring',
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
    url: process.env.REDIS_URL || 'redis://localhost:6379',
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
  const endpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000/minio/health/live';
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(3000) });

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
