import pg from 'pg';

export function createPanelRepository(databaseUrl) {
  const pool = new pg.Pool({ connectionString: databaseUrl });

  return {
    async listSessions(scope) {
      const values = [];
      const courseFilter = scope.institutional ? '' : 'WHERE sessions.moodle_course_id = ANY($1::text[])';
      if (!scope.institutional) {
        values.push(scope.courseIds);
      }
      const result = await pool.query(`
        SELECT sessions.id, sessions.moodle_course_id, sessions.moodle_quiz_id,
          sessions.moodle_attempt_id, sessions.device_mode, sessions.status,
          sessions.created_at, sessions.prepared_at,
          COUNT(alerts.id)::int AS alert_count,
          COUNT(alerts.id) FILTER (WHERE alerts.status = 'open')::int AS open_alert_count
        FROM proctoring_sessions sessions
        LEFT JOIN proctoring_alerts alerts ON alerts.session_id = sessions.id
        ${courseFilter}
        GROUP BY sessions.id
        ORDER BY sessions.created_at DESC
        LIMIT 200
      `, values);
      return result.rows.map(mapSessionSummary);
    },
    async getSession(id, scope) {
      const values = [id];
      const courseFilter = scope.institutional ? '' : 'AND sessions.moodle_course_id = ANY($2::text[])';
      if (!scope.institutional) {
        values.push(scope.courseIds);
      }
      const sessionResult = await pool.query(`
        SELECT * FROM proctoring_sessions sessions
        WHERE sessions.id = $1 ${courseFilter}
      `, values);
      if (sessionResult.rowCount === 0) {
        return null;
      }
      const [events, alerts, evidence] = await Promise.all([
        pool.query('SELECT id, type, occurred_at, metadata FROM proctoring_events WHERE session_id = $1 ORDER BY occurred_at', [id]),
        pool.query('SELECT id, event_id, type, severity, status, created_at, reviewed_at, reviewed_by, review_note FROM proctoring_alerts WHERE session_id = $1 ORDER BY created_at', [id]),
        pool.query("SELECT id, kind, content_type, created_at, expires_at FROM proctoring_evidence WHERE session_id = $1 AND deleted_at IS NULL ORDER BY created_at", [id])
      ]);
      const row = sessionResult.rows[0];
      return {
        id: row.id,
        courseId: row.moodle_course_id,
        quizId: row.moodle_quiz_id,
        attemptId: row.moodle_attempt_id,
        deviceMode: row.device_mode,
        status: row.status,
        createdAt: row.created_at.toISOString(),
        events: events.rows.map((event) => ({ ...event, occurred_at: event.occurred_at.toISOString() })),
        alerts: alerts.rows.map((alert) => ({ ...alert, created_at: alert.created_at.toISOString(), reviewed_at: alert.reviewed_at?.toISOString() ?? null })),
        evidence: evidence.rows.map((item) => ({ ...item, created_at: item.created_at.toISOString(), expires_at: item.expires_at.toISOString() }))
      };
    },
    async reviewAlert(alertId, reviewerId, status, note, scope) {
      const values = [alertId, reviewerId, status, note];
      const courseFilter = scope.institutional ? '' : 'AND sessions.moodle_course_id = ANY($5::text[])';
      if (!scope.institutional) {
        values.push(scope.courseIds);
      }
      const result = await pool.query(`
        UPDATE proctoring_alerts alerts
        SET status = $3, reviewed_at = NOW(), reviewed_by = $2, review_note = $4
        FROM proctoring_sessions sessions
        WHERE alerts.id = $1 AND sessions.id = alerts.session_id ${courseFilter}
        RETURNING alerts.id, alerts.status, alerts.reviewed_at, alerts.reviewed_by, alerts.review_note
      `, values);
      return result.rowCount === 0 ? null : result.rows[0];
    },
    async close() {
      await pool.end();
    }
  };
}

function mapSessionSummary(row) {
  return {
    id: row.id,
    courseId: row.moodle_course_id,
    quizId: row.moodle_quiz_id,
    attemptId: row.moodle_attempt_id,
    deviceMode: row.device_mode,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    preparedAt: row.prepared_at?.toISOString() ?? null,
    alertCount: row.alert_count,
    openAlertCount: row.open_alert_count
  };
}
