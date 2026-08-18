import { ConfigurationError, createInfrastructureConfig } from './mysql-config.mjs';

async function checkInfrastructure() {
  const infrastructure = await createInfrastructureConfig(process.env);
  const mysql = await import('mysql2/promise');
  const connection = await mysql.createConnection(infrastructure.mysql);

  try {
    await connection.query('SELECT 1');
  } finally {
    await connection.end().catch(() => {});
  }
}

try {
  await checkInfrastructure();
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error(`Configuration error: ${error.message}`);
  } else {
    console.error('Unavailable dependencies: MySQL');
  }
  process.exit(1);
}

console.log('Infrastructure dependency is available: MySQL');
