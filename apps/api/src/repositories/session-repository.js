export class SessionRepository {
  constructor(database) {
    this.database = database;
  }

  async create(session) {
    const result = await this.database.query(
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
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING
        id,
        moodle_user_id AS "moodleUserId",
        moodle_course_id AS "moodleCourseId",
        moodle_quiz_id AS "moodleQuizId",
        moodle_attempt_id AS "moodleAttemptId",
        device_mode AS "deviceMode",
        status,
        issued_at AS "issuedAt",
        expires_at AS "expiresAt",
        created_at AS "createdAt"`,
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
        session.createdAt
      ]
    );

    return result.rows[0];
  }
}
