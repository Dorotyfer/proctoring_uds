import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ConfigurationError, createMySqlConfig } from './mysql-config.mjs';

const migrationPath = process.argv[2];

if (!migrationPath) {
  console.error('Usage: node --env-file=.env scripts/apply-migration.mjs <migration.sql>');
  process.exit(1);
}

try {
  const mysql = await import('mysql2/promise');
  const migrationSql = await readFile(path.resolve(migrationPath), 'utf8');
  const connection = await mysql.createConnection({
    ...createMySqlConfig(process.env),
    multipleStatements: true
  });

  try {
    await connection.query(migrationSql);
  } finally {
    await connection.end().catch(() => {});
  }

  console.log(`Applied migration: ${migrationPath}`);
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error(`Configuration error: ${error.message}`);
  } else {
    console.error(`Migration failed: ${error.message}`);
  }
  process.exit(1);
}
