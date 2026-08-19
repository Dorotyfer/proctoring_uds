import crypto from 'node:crypto';
import pg from 'pg';

export function createAlertRepository(databaseUrl) {
  const pool = new pg.Pool({ connectionString: databaseUrl });

  return {
    async createForEvent(event, severity) {
      const result = await pool.query(`
        INSERT INTO proctoring_alerts (id, session_id, event_id, type, severity)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (event_id) DO UPDATE SET event_id = EXCLUDED.event_id
        RETURNING id, session_id, event_id, type, severity, status, created_at, reviewed_at
      `, [crypto.randomUUID(), event.sessionId, event.id, event.type, severity]);

      return mapAlert(result.rows[0]);
    },
    async close() {
      await pool.end();
    }
  };
}

function mapAlert(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    eventId: row.event_id,
    type: row.type,
    severity: row.severity,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    reviewedAt: row.reviewed_at?.toISOString() ?? null
  };
}
