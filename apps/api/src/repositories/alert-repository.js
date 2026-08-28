import crypto from 'node:crypto';

import { createMysqlPool } from '../db/mysql-pool.js';
import { toIsoDate } from '../db/mysql-row.js';

export function createAlertRepository(databaseUrl) {
  const pool = createMysqlPool(databaseUrl);

  return {
    async createForEvent(event, severity) {
      await pool.execute(`
        INSERT INTO proctoring_alerts (id, session_id, event_id, type, severity, capture_status)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE event_id = VALUES(event_id)
      `, [
        crypto.randomUUID(), event.sessionId, event.id, event.type, severity,
        event.metadata?.captureStatus === 'available' ? 'available' : 'unavailable'
      ]);
      const [rows] = await pool.execute(`
        SELECT id, session_id, event_id, type, severity, status, capture_status, created_at, reviewed_at
        FROM proctoring_alerts WHERE event_id = ?
      `, [event.id]);
      return mapAlert(rows[0]);
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
    createdAt: toIsoDate(row.created_at),
    captureStatus: row.capture_status ?? 'pending',
    reviewedAt: row.reviewed_at ? toIsoDate(row.reviewed_at) : null
  };
}
