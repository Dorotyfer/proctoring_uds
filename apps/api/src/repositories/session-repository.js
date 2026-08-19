import crypto from 'node:crypto';
import pg from 'pg';

export function createSessionRepository(databaseUrl) {
  const pool = new pg.Pool({ connectionString: databaseUrl });

  return {
    async ping() {
      await pool.query('SELECT 1');
    },
    async create(input) {
      const result = await pool.query(`
        INSERT INTO proctoring_sessions (
          id, moodle_user_id, moodle_course_id, moodle_quiz_id, moodle_attempt_id,
          device_mode, issued_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (moodle_attempt_id) DO UPDATE
          SET moodle_attempt_id = EXCLUDED.moodle_attempt_id
        RETURNING id, moodle_user_id, moodle_course_id, moodle_quiz_id,
          moodle_attempt_id, device_mode, status, issued_at, expires_at, created_at
      `, [
        crypto.randomUUID(),
        input.moodleUserId,
        input.moodleCourseId,
        input.moodleQuizId,
        input.moodleAttemptId,
        input.deviceMode,
        input.issuedAt,
        input.expiresAt
      ]);

      return mapSession(result.rows[0]);
    },
    async findById(id) {
      const result = await pool.query(`
        SELECT id, moodle_user_id, moodle_course_id, moodle_quiz_id,
          moodle_attempt_id, device_mode, status, issued_at, expires_at, created_at
        FROM proctoring_sessions
        WHERE id = $1
      `, [id]);

      return result.rowCount === 0 ? null : mapSession(result.rows[0]);
    },
    async complete(id) {
      const result = await pool.query(`
        UPDATE proctoring_sessions
        SET status = 'completed'
        WHERE id = $1
        RETURNING id, moodle_user_id, moodle_course_id, moodle_quiz_id,
          moodle_attempt_id, device_mode, status, issued_at, expires_at, created_at
      `, [id]);

      return result.rowCount === 0 ? null : mapSession(result.rows[0]);
    },
    async activate(id) {
      const result = await pool.query(`
        UPDATE proctoring_sessions
        SET status = 'active'
        WHERE id = $1 AND status IN ('pending', 'active') AND expires_at > NOW()
        RETURNING id, moodle_user_id, moodle_course_id, moodle_quiz_id,
          moodle_attempt_id, device_mode, status, issued_at, expires_at, created_at
      `, [id]);

      return result.rowCount === 0 ? null : mapSession(result.rows[0]);
    },
    async close() {
      await pool.end();
    }
  };
}

function mapSession(row) {
  return {
    id: row.id,
    moodleUserId: row.moodle_user_id,
    moodleCourseId: row.moodle_course_id,
    moodleQuizId: row.moodle_quiz_id,
    moodleAttemptId: row.moodle_attempt_id,
    deviceMode: row.device_mode,
    status: row.status,
    issuedAt: row.issued_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString()
  };
}
