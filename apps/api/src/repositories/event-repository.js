import crypto from 'node:crypto';

import { createMysqlPool } from '../db/mysql-pool.js';
import { parseJson, toIsoDate, toMysqlDate } from '../db/mysql-row.js';

export class EventRateLimitError extends Error {}

export function createEventRepository(databaseUrl) {
  const pool = createMysqlPool(databaseUrl);

  return {
    async create(sessionId, input) {
      const connection = await pool.getConnection();
      let transactionOpen = false;
      try {
        await connection.beginTransaction();
        transactionOpen = true;
        await connection.execute(
          'SELECT id FROM proctoring_sessions WHERE id = ? FOR UPDATE',
          [sessionId]
        );

        const [existing] = await connection.execute(eventSelect(
          'session_id = ? AND client_event_id = ?'
        ), [sessionId, input.clientEventId]);
        if (existing.length > 0) {
          await connection.commit();
          transactionOpen = false;
          return mapEvent(existing[0]);
        }

        const [recent] = await connection.execute(`
          SELECT COUNT(*) AS total FROM proctoring_events
          WHERE session_id = ? AND received_at >= UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE
        `, [sessionId]);
        if (Number(recent[0].total) >= 120) {
          throw new EventRateLimitError('Session event rate limit exceeded');
        }

        const id = crypto.randomUUID();
        await connection.execute(`
          INSERT INTO proctoring_events (
            id, session_id, client_event_id, type, occurred_at, metadata
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [id, sessionId, input.clientEventId, input.type, toMysqlDate(input.occurredAt), JSON.stringify(input.metadata)]);
        const [rows] = await connection.execute(eventSelect('id = ?'), [id]);
        await connection.commit();
        transactionOpen = false;
        return mapEvent(rows[0]);
      } catch (error) {
        if (transactionOpen) {
          await connection.rollback();
        }
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

function eventSelect(condition) {
  return `
    SELECT id, session_id, client_event_id, type, occurred_at, metadata, received_at
    FROM proctoring_events WHERE ${condition}
  `;
}

function mapEvent(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    clientEventId: row.client_event_id,
    type: row.type,
    occurredAt: toIsoDate(row.occurred_at),
    metadata: parseJson(row.metadata),
    receivedAt: toIsoDate(row.received_at)
  };
}
