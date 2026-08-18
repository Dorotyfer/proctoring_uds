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
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

    return session;
  }
}
