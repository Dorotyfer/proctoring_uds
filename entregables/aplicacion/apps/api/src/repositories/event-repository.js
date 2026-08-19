import crypto from 'node:crypto';
import pg from 'pg';

export class EventRateLimitError extends Error {}

export function createEventRepository(databaseUrl) {
  const pool = new pg.Pool({ connectionString: databaseUrl });

  return {
    async create(sessionId, input) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [sessionId]);

        const existing = await client.query(`
          SELECT id, session_id, client_event_id, type, occurred_at, metadata, received_at
          FROM proctoring_events
          WHERE session_id = $1 AND client_event_id = $2
        `, [sessionId, input.clientEventId]);
        if (existing.rowCount > 0) {
          await client.query('COMMIT');
          return mapEvent(existing.rows[0]);
        }

        const recent = await client.query(`
          SELECT COUNT(*)::int AS total
          FROM proctoring_events
          WHERE session_id = $1 AND received_at >= NOW() - INTERVAL '1 minute'
        `, [sessionId]);
        if (recent.rows[0].total >= 120) {
          throw new EventRateLimitError('Session event rate limit exceeded');
        }

        const result = await client.query(`
          INSERT INTO proctoring_events (
            id, session_id, client_event_id, type, occurred_at, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          RETURNING id, session_id, client_event_id, type, occurred_at, metadata, received_at
        `, [
          crypto.randomUUID(),
          sessionId,
          input.clientEventId,
          input.type,
          input.occurredAt,
          JSON.stringify(input.metadata)
        ]);
        await client.query('COMMIT');
        return mapEvent(result.rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    }
  };
}

function mapEvent(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    clientEventId: row.client_event_id,
    type: row.type,
    occurredAt: row.occurred_at.toISOString(),
    metadata: row.metadata,
    receivedAt: row.received_at.toISOString()
  };
}
