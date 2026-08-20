import { createMysqlPool } from '../db/mysql-pool.js';
import { parseJson, toIsoDate } from '../db/mysql-row.js';

export function createPanelRepository(databaseUrl) {
  const pool = createMysqlPool(databaseUrl);

  return {
    async listSessions(scope) {
      const filter = courseScopeFilter(scope, 'WHERE');
      if (filter.empty) {
        return [];
      }
      const [rows] = await pool.execute(`
        SELECT sessions.id, sessions.moodle_course_id, sessions.moodle_quiz_id,
          sessions.moodle_attempt_id, sessions.device_mode, sessions.status,
          sessions.created_at, sessions.prepared_at,
          COUNT(alerts.id) AS alert_count,
          COALESCE(SUM(alerts.status = 'open'), 0) AS open_alert_count
        FROM proctoring_sessions sessions
        LEFT JOIN proctoring_alerts alerts ON alerts.session_id = sessions.id
        ${filter.sql}
        GROUP BY sessions.id
        ORDER BY sessions.created_at DESC LIMIT 200
      `, filter.values);
      return rows.map(mapSessionSummary);
    },
    async getSession(id, scope) {
      const filter = courseScopeFilter(scope, 'AND');
      if (filter.empty) {
        return null;
      }
      const [sessionRows] = await pool.execute(`
        SELECT * FROM proctoring_sessions sessions
        WHERE sessions.id = ? ${filter.sql}
      `, [id, ...filter.values]);
      if (sessionRows.length === 0) {
        return null;
      }
      const [events, alerts, evidence] = await Promise.all([
        pool.execute('SELECT id, type, occurred_at, metadata FROM proctoring_events WHERE session_id = ? ORDER BY occurred_at', [id]),
        pool.execute('SELECT id, event_id, type, severity, status, created_at, reviewed_at, reviewed_by, review_note FROM proctoring_alerts WHERE session_id = ? ORDER BY created_at', [id]),
        pool.execute('SELECT id, kind, content_type, created_at, expires_at FROM proctoring_evidence WHERE session_id = ? AND deleted_at IS NULL ORDER BY created_at', [id])
      ]);
      const row = sessionRows[0];
      return {
        id: row.id,
        courseId: row.moodle_course_id,
        quizId: row.moodle_quiz_id,
        attemptId: row.moodle_attempt_id,
        deviceMode: row.device_mode,
        status: row.status,
        createdAt: toIsoDate(row.created_at),
        events: events[0].map((event) => ({
          ...event,
          occurred_at: toIsoDate(event.occurred_at),
          metadata: parseJson(event.metadata)
        })),
        alerts: alerts[0].map((alert) => ({
          ...alert,
          created_at: toIsoDate(alert.created_at),
          reviewed_at: alert.reviewed_at ? toIsoDate(alert.reviewed_at) : null
        })),
        evidence: evidence[0].map((item) => ({
          ...item,
          created_at: toIsoDate(item.created_at),
          expires_at: toIsoDate(item.expires_at)
        }))
      };
    },
    async reviewAlert(alertId, reviewerId, status, note, scope) {
      const filter = courseScopeFilter(scope, 'AND');
      if (filter.empty) {
        return null;
      }
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [authorized] = await connection.execute(`
          SELECT alerts.id FROM proctoring_alerts alerts
          JOIN proctoring_sessions sessions ON sessions.id = alerts.session_id
          WHERE alerts.id = ? ${filter.sql} FOR UPDATE
        `, [alertId, ...filter.values]);
        if (authorized.length === 0) {
          await connection.rollback();
          return null;
        }
        await connection.execute(`
          UPDATE proctoring_alerts
          SET status = ?, reviewed_at = UTC_TIMESTAMP(3), reviewed_by = ?, review_note = ?
          WHERE id = ?
        `, [status, reviewerId, note, alertId]);
        const [rows] = await connection.execute(`
          SELECT id, status, reviewed_at, reviewed_by, review_note
          FROM proctoring_alerts WHERE id = ?
        `, [alertId]);
        await connection.commit();
        return {
          ...rows[0],
          reviewed_at: toIsoDate(rows[0].reviewed_at)
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    async close() {
      await pool.end();
    }
  };
}

function courseScopeFilter(scope, prefix) {
  if (scope.institutional) {
    return { empty: false, sql: '', values: [] };
  }
  if (scope.courseIds.length === 0) {
    return { empty: true, sql: '', values: [] };
  }
  return {
    empty: false,
    sql: `${prefix} sessions.moodle_course_id IN (${scope.courseIds.map(() => '?').join(', ')})`,
    values: scope.courseIds
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
    createdAt: toIsoDate(row.created_at),
    preparedAt: row.prepared_at ? toIsoDate(row.prepared_at) : null,
    alertCount: Number(row.alert_count),
    openAlertCount: Number(row.open_alert_count)
  };
}
