import { createMysqlPool } from '../db/mysql-pool.js';
import { parseJson, toIsoDate } from '../db/mysql-row.js';

export function createPanelRepository(databaseUrl) {
  const pool = createMysqlPool(databaseUrl);

  return {
    async listCourses(scope, query) {
      const scopeFilter = courseScopeFilter(scope, 'WHERE');
      if (scopeFilter.empty) {
        return pagedResult('courses', [], 0, query);
      }
      const search = query.query === '' ? null : `%${escapeLike(query.query)}%`;
      const searchSql = search ? `${scopeFilter.sql ? 'AND' : 'WHERE'} courses.name LIKE ? ESCAPE '\\\\'` : '';
      const values = search ? [...scopeFilter.values, search] : scopeFilter.values;
      const [countRows] = await pool.execute(`
        SELECT COUNT(DISTINCT sessions.moodle_course_id) AS total
        FROM proctoring_sessions sessions
        JOIN proctoring_courses courses ON courses.moodle_course_id = sessions.moodle_course_id
        ${scopeFilter.sql} ${searchSql}
      `, values);
      const [rows] = await pool.execute(`
        SELECT sessions.moodle_course_id, courses.name,
          COUNT(DISTINCT sessions.id) AS attempt_count,
          COALESCE(SUM(alerts.status = 'open'), 0) AS open_alert_count
        FROM proctoring_sessions sessions
        JOIN proctoring_courses courses ON courses.moodle_course_id = sessions.moodle_course_id
        LEFT JOIN proctoring_alerts alerts ON alerts.session_id = sessions.id
        ${scopeFilter.sql} ${searchSql}
        GROUP BY sessions.moodle_course_id, courses.name
        ORDER BY courses.name, sessions.moodle_course_id
        LIMIT ? OFFSET ?
      `, [...values, query.pageSize, offset(query)]);
      return pagedResult('courses', rows.map((row) => ({
        id: row.moodle_course_id,
        name: row.name,
        attemptCount: Number(row.attempt_count),
        openAlertCount: Number(row.open_alert_count)
      })), Number(countRows[0].total), query);
    },
    async listCourseSessions(courseId, scope, query) {
      const filters = sessionListFilters(courseId, scope, query);
      if (filters.empty) {
        return pagedResult('sessions', [], 0, query);
      }
      const [countRows] = await pool.execute(`
        SELECT COUNT(*) AS total FROM (
          SELECT sessions.id
          FROM proctoring_sessions sessions
          LEFT JOIN proctoring_alerts alerts ON alerts.session_id = sessions.id
          ${filters.whereSql}
          GROUP BY sessions.id
          ${filters.havingSql}
        ) filtered_sessions
      `, [...filters.whereValues, ...filters.havingValues]);
      const [rows] = await pool.execute(`
        SELECT sessions.id, sessions.moodle_course_id, sessions.moodle_quiz_id,
          sessions.moodle_attempt_id, sessions.quiz_name, sessions.student_name,
          sessions.student_document, sessions.device_mode, sessions.status,
          sessions.created_at, sessions.prepared_at,
          COUNT(alerts.id) AS alert_count,
          COALESCE(SUM(alerts.status = 'open'), 0) AS open_alert_count
        FROM proctoring_sessions sessions
        LEFT JOIN proctoring_alerts alerts ON alerts.session_id = sessions.id
        ${filters.whereSql}
        GROUP BY sessions.id
        ${filters.havingSql}
        ORDER BY sessions.created_at DESC
        LIMIT ? OFFSET ?
      `, [...filters.whereValues, ...filters.havingValues, query.pageSize, offset(query)]);
      return pagedResult('sessions', rows.map(mapSessionSummary), Number(countRows[0].total), query);
    },
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
        quizName: row.quiz_name ?? null,
        attemptId: row.moodle_attempt_id,
        studentName: row.student_name ?? null,
        studentDocument: row.student_document ?? null,
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
    quizName: row.quiz_name ?? null,
    attemptId: row.moodle_attempt_id,
    studentName: row.student_name ?? null,
    studentDocumentLast4: maskStudentDocument(row.student_document),
    deviceMode: row.device_mode,
    status: row.status,
    createdAt: toIsoDate(row.created_at),
    preparedAt: row.prepared_at ? toIsoDate(row.prepared_at) : null,
    alertCount: Number(row.alert_count),
    openAlertCount: Number(row.open_alert_count)
  };
}

export function maskStudentDocument(document) {
  if (!document) {
    return null;
  }
  const value = String(document);
  if (value.length <= 4) {
    return value;
  }
  return `${'•'.repeat(value.length - 4)}${value.slice(-4)}`;
}

function sessionListFilters(courseId, scope, query) {
  const scopeFilter = courseScopeFilter(scope, 'AND');
  if (scopeFilter.empty) {
    return { empty: true };
  }
  const where = ['sessions.moodle_course_id = ?'];
  const whereValues = [courseId, ...scopeFilter.values];
  if (scopeFilter.sql) {
    where.push(scopeFilter.sql.replace(/^AND\s+/i, ''));
  }
  if (query.query) {
    const search = `%${escapeLike(query.query)}%`;
    where.push(`(
      sessions.student_name LIKE ? ESCAPE '\\\\' OR
      sessions.student_document LIKE ? ESCAPE '\\\\' OR
      sessions.quiz_name LIKE ? ESCAPE '\\\\' OR
      sessions.moodle_attempt_id LIKE ? ESCAPE '\\\\'
    )`);
    whereValues.push(search, search, search, search);
  }
  if (query.status !== 'all') {
    where.push('sessions.status = ?');
    whereValues.push(query.status);
  }
  if (query.dateFrom) {
    where.push('sessions.created_at >= ?');
    whereValues.push(`${query.dateFrom} 00:00:00.000`);
  }
  if (query.dateTo) {
    where.push('sessions.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    whereValues.push(`${query.dateTo} 00:00:00.000`);
  }
  const having = [];
  if (query.alerts === 'open') {
    having.push("SUM(alerts.status = 'open') > 0");
  } else if (query.alerts === 'any') {
    having.push('COUNT(alerts.id) > 0');
  } else if (query.alerts === 'none') {
    having.push('COUNT(alerts.id) = 0');
  }
  return {
    empty: false,
    whereSql: `WHERE ${where.join(' AND ')}`,
    whereValues,
    havingSql: having.length > 0 ? `HAVING ${having.join(' AND ')}` : '',
    havingValues: []
  };
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

function offset(query) {
  return (query.page - 1) * query.pageSize;
}

function pagedResult(key, items, total, query) {
  return {
    [key]: items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize)
  };
}
