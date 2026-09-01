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
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute(`
          INSERT INTO proctoring_courses (moodle_course_id, name, updated_at)
          VALUES (?, ?, UTC_TIMESTAMP(3))
          ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = VALUES(updated_at)
        `, [input.moodleCourseId, input.courseName]);
        await connection.execute(`
          INSERT INTO proctoring_sessions (
            id, moodle_user_id, moodle_course_id, moodle_quiz_id, moodle_attempt_id,
            quiz_name, student_name, student_document, device_mode, control_level, issued_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            quiz_name = VALUES(quiz_name),
            student_name = VALUES(student_name),
            student_document = VALUES(student_document),
            control_level = VALUES(control_level)
        `, [
          crypto.randomUUID(), input.moodleUserId, input.moodleCourseId,
          input.moodleQuizId, input.moodleAttemptId, input.quizName,
          input.studentName, input.studentDocument, input.deviceMode, input.controlLevel,
          toMysqlDate(input.issuedAt), toMysqlDate(input.expiresAt)
        ]);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
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
          reference_evidence_id = ?, identity_document_evidence_id = ?, liveness_challenge = ?
        WHERE id = ? AND status IN ('pending', 'active') AND expires_at > UTC_TIMESTAMP(3)
      `, [
        preparation.evidenceId,
        preparation.identityDocumentEvidenceId ?? null,
        JSON.stringify(preparation.livenessChallenge),
        id
      ]);
      return result.affectedRows === 0 ? null : findById(pool, id);
    },
    async attachIdentityDocumentEvidence(id, evidenceId) {
      const [result] = await pool.execute(`
        UPDATE proctoring_sessions
        SET identity_document_evidence_id = ?
        WHERE id = ? AND status = 'pending' AND expires_at > UTC_TIMESTAMP(3)
      `, [evidenceId, id]);
      return result.affectedRows > 0;
    },
    async close() {
      await pool.end();
    }
  };
}

async function findByAttempt(pool, attemptId) {
  const [rows] = await pool.execute(sessionSelect('sessions.moodle_attempt_id = ?'), [attemptId]);
  return mapSession(rows[0]);
}

async function findById(pool, id) {
  const [rows] = await pool.execute(sessionSelect('sessions.id = ?'), [id]);
  return rows.length === 0 ? null : mapSession(rows[0]);
}

function sessionSelect(condition) {
  return `
    SELECT sessions.id, sessions.moodle_user_id, sessions.moodle_course_id, sessions.moodle_quiz_id,
      moodle_attempt_id, device_mode, status, issued_at, expires_at, created_at,
      quiz_name, student_name, student_document, device_mode, control_level,
      liveness_challenge, reference_evidence_id, identity_document_evidence_id,
      courses.name AS course_name
    FROM proctoring_sessions sessions
    LEFT JOIN proctoring_courses courses ON courses.moodle_course_id = sessions.moodle_course_id
    WHERE ${condition}
  `;
}

function mapSession(row) {
  return {
    id: row.id,
    moodleUserId: row.moodle_user_id,
    moodleCourseId: row.moodle_course_id,
    moodleQuizId: row.moodle_quiz_id,
    moodleAttemptId: row.moodle_attempt_id,
    courseName: row.course_name,
    quizName: row.quiz_name,
    studentName: row.student_name,
    studentDocument: row.student_document,
    deviceMode: row.device_mode,
    controlLevel: row.control_level ?? 'medium',
    status: row.status,
    issuedAt: toIsoDate(row.issued_at),
    expiresAt: toIsoDate(row.expires_at),
    createdAt: toIsoDate(row.created_at),
    identityDocumentEvidenceId: row.identity_document_evidence_id ?? null,
    livenessChallenge: parseJson(row.liveness_challenge)
  };
}
