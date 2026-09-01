import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const migrationsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/db/migrations');

test('uses retry-safe MariaDB DDL and an indexable evidence key', async () => {
  const files = await fs.readdir(migrationsDirectory);
  const migrations = await Promise.all(files.sort().map(async (file) => ({
    file,
    sql: await fs.readFile(path.join(migrationsDirectory, file), 'utf8')
  })));

  for (const migration of migrations) {
    assert.match(migration.sql, /CREATE TABLE IF NOT EXISTS|ALTER TABLE/);
  }
  const evidenceMigration = migrations.find((migration) => migration.file === '004_evidence_panel.sql');
  assert.match(evidenceMigration.sql, /object_key VARCHAR\((?:[1-6]\d\d|7[0-6]\d)\) NOT NULL UNIQUE/);
  assert.doesNotMatch(evidenceMigration.sql, /ADD CONSTRAINT IF NOT EXISTS/);

  const panelCatalogMigration = migrations.find((migration) => migration.file === '005_panel_course_catalog.sql');
  assert.ok(panelCatalogMigration);
  assert.match(panelCatalogMigration.sql, /CREATE TABLE IF NOT EXISTS proctoring_courses/);
  assert.match(panelCatalogMigration.sql, /ADD COLUMN IF NOT EXISTS quiz_name/);
  assert.match(panelCatalogMigration.sql, /ADD COLUMN IF NOT EXISTS student_document/);
  assert.match(panelCatalogMigration.sql, /SELECT DISTINCT moodle_course_id/);

  const incidentEvidenceMigration = migrations.find((migration) => migration.file === '006_incident_evidence.sql');
  assert.ok(incidentEvidenceMigration);
  assert.match(incidentEvidenceMigration.sql, /ADD COLUMN IF NOT EXISTS event_id CHAR\(36\) NULL/);
  assert.match(incidentEvidenceMigration.sql, /proctoring_evidence_event_unique/);

  const biometricMigration = migrations.find((migration) => migration.file === '007_biometric_profiles.sql');
  assert.ok(biometricMigration);
  assert.match(biometricMigration.sql, /proctoring_biometric_profiles/);
  assert.match(biometricMigration.sql, /moodle_user_id VARCHAR\(255\) NOT NULL UNIQUE/);
  assert.match(biometricMigration.sql, /proctoring_biometric_checks/);
  assert.match(biometricMigration.sql, /proctoring_biometric_audit/);
  assert.match(biometricMigration.sql, /biometric_mismatch/);

  const identityDocumentMigration = migrations.find((migration) => migration.file === '010_identity_document_evidence.sql');
  assert.ok(identityDocumentMigration);
  assert.match(identityDocumentMigration.sql, /identity_document_evidence_id CHAR\(36\) NULL/);
  assert.match(identityDocumentMigration.sql, /identity_document/);

  const migrator = await fs.readFile(path.join(migrationsDirectory, '../migrate.js'), 'utf8');
  assert.match(migrator, /information_schema\.table_constraints/);
  assert.match(migrator, /proctoring_evidence_event_fk/);
  assert.match(migrator, /proctoring_sessions_identity_document_evidence_fk/);
});
