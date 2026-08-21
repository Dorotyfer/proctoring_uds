import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

import { loadDatabaseConfig } from '../config.js';

const migrationsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const config = loadDatabaseConfig();
const connection = await mysql.createConnection({
  uri: config.databaseUrl,
  multipleStatements: true
});

try {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS proctoring_schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const files = (await fs.readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const [applied] = await connection.execute(
      'SELECT 1 FROM proctoring_schema_migrations WHERE name = ?',
      [file]
    );
    if (applied.length > 0) {
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDirectory, file), 'utf8');
    await connection.beginTransaction();
    try {
      await connection.query(sql);
      await ensureReferenceEvidenceForeignKey(connection, file);
      await ensureIncidentEvidenceForeignKey(connection, file);
      await connection.execute(
        'INSERT INTO proctoring_schema_migrations (name) VALUES (?)',
        [file]
      );
      await connection.commit();
      console.log(`Applied migration: ${file}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }
} finally {
  await connection.end();
}

async function ensureIncidentEvidenceForeignKey(connection, migrationFile) {
  if (migrationFile !== '006_incident_evidence.sql') {
    return;
  }

  const [constraints] = await connection.execute(`
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE()
      AND table_name = 'proctoring_evidence'
      AND constraint_name = 'proctoring_evidence_event_fk'
  `);
  if (constraints.length > 0) {
    return;
  }

  await connection.query(`
    ALTER TABLE proctoring_evidence
    ADD CONSTRAINT proctoring_evidence_event_fk
    FOREIGN KEY (event_id) REFERENCES proctoring_events(id)
  `);
}

async function ensureReferenceEvidenceForeignKey(connection, migrationFile) {
  if (migrationFile !== '004_evidence_panel.sql') {
    return;
  }

  const [constraints] = await connection.execute(`
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE()
      AND table_name = 'proctoring_sessions'
      AND constraint_name = 'proctoring_sessions_reference_evidence_fk'
  `);
  if (constraints.length > 0) {
    return;
  }

  await connection.query(`
    ALTER TABLE proctoring_sessions
    ADD CONSTRAINT proctoring_sessions_reference_evidence_fk
    FOREIGN KEY (reference_evidence_id) REFERENCES proctoring_evidence(id)
  `);
}
