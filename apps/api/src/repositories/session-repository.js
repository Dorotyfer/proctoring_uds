export class SessionRepository {
  constructor(database) {
    this.database = database;
  }

  async create(session) {
    await this.database.execute(
      `INSERT INTO proctoring_sessions (
        id,
        moodle_user_id,
        moodle_course_id,
        moodle_quiz_id,
        moodle_attempt_id,
        device_mode,
        status,
        issued_at,
        expires_at,
        created_at,
        liveness_challenge_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.moodleUserId,
        session.moodleCourseId,
        session.moodleQuizId,
        session.moodleAttemptId,
        session.deviceMode,
        session.status,
        session.issuedAt,
        session.expiresAt,
        session.createdAt,
        session.livenessChallengeId
      ]
    );

    return session;
  }

  async findById(id) {
    const [rows] = await this.database.execute(
      `SELECT
        id AS id,
        moodle_user_id AS moodleUserId,
        moodle_course_id AS moodleCourseId,
        moodle_quiz_id AS moodleQuizId,
        moodle_attempt_id AS moodleAttemptId,
        device_mode AS deviceMode,
        status AS status,
        issued_at AS issuedAt,
        expires_at AS expiresAt,
        created_at AS createdAt,
        liveness_challenge_id AS livenessChallengeId,
        liveness_challenge_completed_at AS livenessChallengeCompletedAt
      FROM proctoring_sessions WHERE id = ?`,
      [id]
    );
    return rows[0] ?? null;
  }

  async setStatus(id, status) {
    await this.database.execute('UPDATE proctoring_sessions SET status = ? WHERE id = ?', [status, id]);
  }

  async consumeLivenessChallenge({ sessionId, challengeId, completedAt }) {
    const [result] = await this.database.execute(
      `UPDATE proctoring_sessions
       SET liveness_challenge_completed_at = ?
       WHERE id = ?
         AND liveness_challenge_id = ?
         AND liveness_challenge_completed_at IS NULL`,
      [completedAt, sessionId, challengeId]
    );
    return result.affectedRows === 1;
  }

  async savePreparation(submission) {
    await this.database.execute(
      `INSERT INTO proctoring_preparation_submissions (session_id, evidence_json, submitted_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE evidence_json = VALUES(evidence_json), submitted_at = VALUES(submitted_at)`,
      [submission.sessionId, JSON.stringify(submission.evidence), submission.submittedAt]
    );
  }

  async findPreparation(sessionId) {
    const [rows] = await this.database.execute(
      `SELECT session_id AS sessionId, evidence_json AS evidenceJson, submitted_at AS submittedAt
       FROM proctoring_preparation_submissions WHERE session_id = ?`,
      [sessionId]
    );
    if (!rows[0]) {
      return null;
    }
    return {
      sessionId: rows[0].sessionId,
      evidence: JSON.parse(rows[0].evidenceJson),
      submittedAt: rows[0].submittedAt
    };
  }
}
