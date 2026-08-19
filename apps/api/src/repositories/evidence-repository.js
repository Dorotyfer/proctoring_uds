import crypto from 'node:crypto';
import pg from 'pg';

export function createEvidenceRepository(databaseUrl) {
  const pool = new pg.Pool({ connectionString: databaseUrl });

  return {
    async create(input) {
      const result = await pool.query(`
        INSERT INTO proctoring_evidence (
          id, session_id, kind, object_key, content_type, byte_size, sha256,
          encryption_iv, encryption_tag, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        crypto.randomUUID(), input.sessionId, input.kind, input.objectKey,
        input.contentType, input.byteSize, input.sha256, input.encryptionIv,
        input.encryptionTag, input.expiresAt
      ]);
      return mapEvidence(result.rows[0]);
    },
    async findById(id) {
      const result = await pool.query(`
        SELECT evidence.*, sessions.moodle_course_id
        FROM proctoring_evidence evidence
        JOIN proctoring_sessions sessions ON sessions.id = evidence.session_id
        WHERE evidence.id = $1 AND evidence.deleted_at IS NULL
      `, [id]);
      return result.rowCount === 0 ? null : mapEvidence(result.rows[0]);
    },
    async audit(input) {
      await pool.query(`
        INSERT INTO proctoring_evidence_audit (
          evidence_id, actor_moodle_user_id, action, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5)
      `, [input.evidenceId, input.actorId, input.action, input.ipAddress, input.userAgent]);
    },
    async findExpired(limit) {
      const result = await pool.query(`
        SELECT * FROM proctoring_evidence
        WHERE expires_at <= NOW() AND deleted_at IS NULL
        ORDER BY expires_at
        LIMIT $1
      `, [limit]);
      return result.rows.map(mapEvidence);
    },
    async markDeleted(id) {
      await pool.query(`
        UPDATE proctoring_evidence SET deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
      `, [id]);
    },
    async close() {
      await pool.end();
    }
  };
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
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null
  };
}
