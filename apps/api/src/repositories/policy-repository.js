import crypto from 'node:crypto';

import { createMysqlPool } from '../db/mysql-pool.js';
import { parseJson, toIsoDate, toMysqlDate } from '../db/mysql-row.js';

export function createPolicyRepository(databaseUrl) {
  const pool = createMysqlPool(databaseUrl);

  return {
    async create({ courseId, quizId, policy, actorId }) {
      const id = crypto.randomUUID();
      await pool.execute(`
        INSERT INTO proctoring_policies
          (id, moodle_course_id, moodle_quiz_id, version, policy_json, actor_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        courseId,
        quizId,
        policy.version,
        JSON.stringify(policy),
        actorId,
        toMysqlDate(new Date().toISOString())
      ]);
      return findById(pool, id);
    },
    async findLatest(courseId, quizId) {
      const [rows] = await pool.execute(`
        SELECT id, moodle_course_id, moodle_quiz_id, version, policy_json, actor_id, created_at
        FROM proctoring_policies
        WHERE moodle_course_id = ? AND moodle_quiz_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `, [courseId, quizId]);
      return rows.length === 0 ? null : mapPolicy(rows[0]);
    },
    async close() {
      await pool.end();
    }
  };
}

async function findById(pool, id) {
  const [rows] = await pool.execute(`
    SELECT id, moodle_course_id, moodle_quiz_id, version, policy_json, actor_id, created_at
    FROM proctoring_policies WHERE id = ?
  `, [id]);
  return rows.length === 0 ? null : mapPolicy(rows[0]);
}

function mapPolicy(row) {
  return {
    id: row.id,
    courseId: row.moodle_course_id,
    quizId: row.moodle_quiz_id,
    version: row.version,
    policy: parseJson(row.policy_json),
    actorId: row.actor_id,
    createdAt: toIsoDate(row.created_at)
  };
}
