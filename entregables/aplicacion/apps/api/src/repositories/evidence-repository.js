import crypto from 'node:crypto';

import { createMysqlPool } from '../db/mysql-pool.js';
import { toIsoDate } from '../db/mysql-row.js';

export function createEvidenceRepository(databaseUrl) {
  const pool = createMysqlPool(databaseUrl);

  return {
    async create(input) {
      const id = crypto.randomUUID();
      await pool.execute(`
        INSERT INTO proctoring_evidence (
          id, session_id, kind, object_key, content_type, byte_size, sha256,
          encryption_iv, encryption_tag, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, input.sessionId, input.kind, input.objectKey, input.contentType,
        input.byteSize, input.sha256, input.encryptionIv, input.encryptionTag, input.expiresAt]);
      return findEvidenceById(pool, id);
    },
    async findById(id) {
      const [rows] = await pool.execute(`
        SELECT evidence.*, sessions.moodle_course_id
        FROM proctoring_evidence evidence
        JOIN proctoring_sessions sessions ON sessions.id = evidence.session_id
        WHERE evidence.id = ? AND evidence.deleted_at IS NULL
      `, [id]);
      return rows.length === 0 ? null : mapEvidence(rows[0]);
    },
    async audit(input) {
      await pool.execute(`
        INSERT INTO proctoring_evidence_audit (
          evidence_id, actor_moodle_user_id, action, ip_address, user_agent
        ) VALUES (?, ?, ?, ?, ?)
      `, [input.evidenceId, input.actorId, input.action, input.ipAddress, input.userAgent]);
    },
    async findExpired(limit) {
      const [rows] = await pool.execute(`
        SELECT * FROM proctoring_evidence
        WHERE expires_at <= UTC_TIMESTAMP(3) AND deleted_at IS NULL
        ORDER BY expires_at LIMIT ?
      `, [limit]);
      return rows.map(mapEvidence);
    },
    async markDeleted(id) {
      await pool.execute(`
        UPDATE proctoring_evidence SET deleted_at = UTC_TIMESTAMP(3)
        WHERE id = ? AND deleted_at IS NULL
      `, [id]);
    },
    async close() {
      await pool.end();
    }
  };
}

async function findEvidenceById(pool, id) {
  const [rows] = await pool.execute('SELECT * FROM proctoring_evidence WHERE id = ?', [id]);
  return mapEvidence(rows[0]);
}

function mapEvidence(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    courseId: row.moodle_course_id ?? null,
    kind: row.kind,
    objectKey: row.object_key,
    contentType: row.content_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    encryptionIv: row.encryption_iv,
    encryptionTag: row.encryption_tag,
    createdAt: toIsoDate(row.created_at),
    expiresAt: toIsoDate(row.expires_at),
    deletedAt: row.deleted_at ? toIsoDate(row.deleted_at) : null
  };
}
