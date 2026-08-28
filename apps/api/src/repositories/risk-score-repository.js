import crypto from 'node:crypto';

import { createMysqlPool } from '../db/mysql-pool.js';
import { toMysqlDate } from '../db/mysql-row.js';

export function createRiskScoreRepository(databaseUrl) {
  const pool = createMysqlPool(databaseUrl);

  return {
    async create(sessionId, risk) {
      await pool.execute(`
        INSERT INTO proctoring_risk_scores
          (id, session_id, score, category, policy_version, factors_json, calculated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        crypto.randomUUID(), sessionId, risk.score, risk.category, risk.policyVersion,
        JSON.stringify(risk.factors), toMysqlDate(risk.calculatedAt)
      ]);
      return risk;
    },
    async close() {
      await pool.end();
    }
  };
}
