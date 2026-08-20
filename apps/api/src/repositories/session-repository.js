import crypto from 'node:crypto';

import { createMysqlPool } from '../db/mysql-pool.js';
import { parseJson, toIsoDate, toMysqlDate } from '../db/mysql-row.js';

export function createSessionRepository(databaseUrl) {
  const pool = createMysqlPool(databaseUrl);

  return {
    async ping() {
      await pool.execute('SELECT 1');
    },
    async create(input) {
      await pool.execute(`
        INSERT INTO proctoring_sessions (
          id, moodle_user_id, moodle_course_id, moodle_quiz_id, moodle_attempt_id,
          device_mode, issued_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE moodle_attempt_id = VALUES(moodle_attempt_id)
      `, [
        crypto.randomUUID(), input.moodleUserId, input.moodleCourseId,
        input.moodleQuizId, input.moodleAttemptId, input.deviceMode,
        toMysqlDate(input.issuedAt), toMysqlDate(input.expiresAt)
      ]);
      return findByAttempt(pool, input.moodleAttemptId);
    },
    async findById(id) {
      return findById(pool, id);
    },
    async complete(id) {
      const [result] = await pool.execute(`
        UPDATE proctoring_sessions SET status = 'completed' WHERE id = ?
      `, [id]);
      return result.affectedRows === 0 ? null : findById(pool, id);
    },
    async activate(id, preparation) {
      const [result] = await pool.execute(`
        UPDATE proctoring_sessions
        SET status = 'active', prepared_at = UTC_TIMESTAMP(3),
          reference_evidence_id = ?, liveness_challenge = ?
        WHERE id = ? AND status IN ('pending', 'active') AND expires_at > UTC_TIMESTAMP(3)
      `, [preparation.evidenceId, JSON.stringify(preparation.livenessChallenge), id]);
      return result.affectedRows === 0 ? null : findById(pool, id);
    },
    async close() {
      await pool.end();
    }
  };
}

async function findByAttempt(pool, attemptId) {
  const [rows] = await pool.execute(sessionSelect('moodle_attempt_id = ?'), [attemptId]);
  return mapSession(rows[0]);
}

async function findById(pool, id) {
  const [rows] = await pool.execute(sessionSelect('id = ?'), [id]);
  return rows.length === 0 ? null : mapSession(rows[0]);
}

function sessionSelect(condition) {
  return `
    SELECT id, moodle_user_id, moodle_course_id, moodle_quiz_id,
      moodle_attempt_id, device_mode, status, issued_at, expires_at, created_at,
      liveness_challenge
    FROM proctoring_sessions WHERE ${condition}
  `;
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
    issuedAt: toIsoDate(row.issued_at),
    expiresAt: toIsoDate(row.expires_at),
    createdAt: toIsoDate(row.created_at),
    livenessChallenge: parseJson(row.liveness_challenge)
  };
}
