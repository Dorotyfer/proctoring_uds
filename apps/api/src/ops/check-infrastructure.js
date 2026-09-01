import mysql from 'mysql2/promise';

import { loadConfig } from '../config.js';
import { createObjectStorageService } from '../services/object-storage-service.js';

const config = loadConfig();
const checks = [
  ['API', checkApi],
  ['MariaDB', checkDatabase],
  ['S3/MinIO', checkObjectStorage]
];
let failures = 0;

for (const [name, check] of checks) {
  try {
    await check();
    console.log(`${name}: disponible`);
  } catch (error) {
    failures += 1;
    console.error(`${name}: no disponible (${error.message})`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
}

async function checkApi() {
  const healthUrl = process.env.API_HEALTH_URL ?? `http://127.0.0.1:${config.port}/health`;
  const response = await fetch(healthUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

async function checkDatabase() {
  const connection = await mysql.createConnection({ uri: config.databaseUrl });
  try {
    await connection.execute('SELECT 1');
  } finally {
    await connection.end();
  }
}

async function checkObjectStorage() {
  await createObjectStorageService(config.objectStorage).check();
}
