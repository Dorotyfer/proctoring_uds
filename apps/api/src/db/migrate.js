import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { loadDatabaseConfig } from '../config.js';

const migrationsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const config = loadDatabaseConfig();
const client = new pg.Client({ connectionString: config.databaseUrl });

await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS proctoring_schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await fs.readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const applied = await client.query(
      'SELECT 1 FROM proctoring_schema_migrations WHERE name = $1',
      [file]
    );

    if (applied.rowCount > 0) {
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDirectory, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO proctoring_schema_migrations (name) VALUES ($1)',
        [file]
      );
      await client.query('COMMIT');
      console.log(`Applied migration: ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
