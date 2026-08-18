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
        created_at AS createdAt
      FROM proctoring_sessions WHERE id = ?`,
      [id]
    );
    return rows[0] ?? null;
  }

  async setStatus(id, status) {
    await this.database.execute('UPDATE proctoring_sessions SET status = ? WHERE id = ?', [status, id]);
  }
}
