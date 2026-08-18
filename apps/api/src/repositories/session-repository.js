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

  async markPreparationReady({ sessionId, challengeId, completedAt }) {
    const [result] = await this.database.execute(
      `UPDATE proctoring_sessions
       SET status = 'ready', liveness_challenge_completed_at = ?
       WHERE id = ?
         AND liveness_challenge_id = ?
         AND liveness_challenge_completed_at IS NULL
         AND status = 'created'`,
      [completedAt, sessionId, challengeId]
    );
    return result.affectedRows === 1;
  }

  async savePreparation(submission) {
    try {
      const [result] = await this.database.execute(
        `INSERT INTO proctoring_preparation_submissions (session_id, submission_id, evidence_json, submitted_at)
         VALUES (?, ?, ?, ?)`,
        [submission.sessionId, submission.id, JSON.stringify(submission.evidence), submission.submittedAt]
      );
      return result.affectedRows === 1;
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        return false;
      }
      throw error;
    }
  }

  async findPreparation(sessionId) {
    const [rows] = await this.database.execute(
      `SELECT session_id AS sessionId, submission_id AS id, evidence_json AS evidenceJson, submitted_at AS submittedAt
       FROM proctoring_preparation_submissions WHERE session_id = ?`,
      [sessionId]
    );
    if (!rows[0]) {
      return null;
    }
    return {
      sessionId: rows[0].sessionId,
      id: rows[0].id,
      evidence: JSON.parse(rows[0].evidenceJson),
      submittedAt: rows[0].submittedAt
    };
  }

  async saveTrustedPreparation(verification) {
    try {
      const [result] = await this.database.execute(
        `INSERT INTO proctoring_preparation_verifications (
          session_id, submission_id, verification_json, verified_at
        ) VALUES (?, ?, ?, ?)`,
        [
          verification.sessionId,
          verification.submissionId,
          JSON.stringify({
            referenceCaptureId: verification.referenceCaptureId,
            identityVerified: verification.identityVerified,
            liveness: verification.liveness
          }),
          verification.verifiedAt
        ]
      );
      return result.affectedRows === 1;
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        return false;
      }
      throw error;
    }
  }

  async findTrustedPreparation(sessionId) {
    const [rows] = await this.database.execute(
      `SELECT session_id AS sessionId, submission_id AS submissionId,
        verification_json AS verificationJson, verified_at AS verifiedAt
       FROM proctoring_preparation_verifications WHERE session_id = ?`,
      [sessionId]
    );
    if (!rows[0]) {
      return null;
    }
    return {
      sessionId: rows[0].sessionId,
      submissionId: rows[0].submissionId,
      ...JSON.parse(rows[0].verificationJson),
      verifiedAt: rows[0].verifiedAt
    };
  }
}
