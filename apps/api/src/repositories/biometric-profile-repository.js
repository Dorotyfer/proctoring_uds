import crypto from 'node:crypto';

import { createMysqlPool } from '../db/mysql-pool.js';
import { toIsoDate, toMysqlDate } from '../db/mysql-row.js';

export function createBiometricProfileRepository(databaseUrl) {
  const pool = createMysqlPool(databaseUrl);

  return {
    async findByUserId(moodleUserId) {
      const [rows] = await pool.execute(profileSelect('moodle_user_id = ?'), [moodleUserId]);
      return rows.length === 0 ? null : mapProfile(rows[0]);
    },

    async list(query) {
      const search = query.query ? `%${escapeLike(query.query)}%` : null;
      const whereSql = search ? "WHERE moodle_user_id LIKE ? ESCAPE '\\\\'" : '';
      const values = search ? [search] : [];
      const [countRows] = await pool.execute(`
        SELECT COUNT(*) AS total
        FROM proctoring_biometric_profiles
        ${whereSql}
      `, values);
      const [rows] = await pool.execute(`
        SELECT moodle_user_id, enrollment_version, status,
          enrolled_at, last_verified_at, revoked_at
        FROM proctoring_biometric_profiles
        ${whereSql}
        ORDER BY enrolled_at DESC, moodle_user_id
        LIMIT ? OFFSET ?
      `, [...values, query.pageSize, offset(query)]);
      const total = Number(countRows[0]?.total ?? 0);
      return {
        profiles: rows.map(mapProfileSummary),
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize)
      };
    },

    async withUserLock(moodleUserId, callback) {
      const connection = await pool.getConnection();
      let transactionOpen = false;
      let namedLockAcquired = false;
      let profile = null;
      try {
        const [lockRows] = await connection.execute(
          'SELECT GET_LOCK(?, 10) AS acquired',
          [`proctoring:biometric:${moodleUserId}`]
        );
        namedLockAcquired = Number(lockRows[0]?.acquired) === 1;
        if (!namedLockAcquired) {
          throw new Error('Unable to acquire biometric profile lock');
        }
        await connection.beginTransaction();
        transactionOpen = true;
        const [profileRows] = await connection.execute(
          profileSelect('moodle_user_id = ? FOR UPDATE'),
          [moodleUserId]
        );
        profile = profileRows.length === 0 ? null : mapProfile(profileRows[0]);
        const transaction = {
          async findCheckBySessionId(sessionId) {
            const [rows] = await connection.execute(checkSelect('session_id = ?'), [sessionId]);
            return rows.length === 0 ? null : mapCheck(rows[0]);
          },
          async getProfile() {
            return profile;
          },
          async insertCheck(input) {
            const id = crypto.randomUUID();
            await connection.execute(`
              INSERT INTO proctoring_biometric_checks (
                id, session_id, profile_id, moodle_user_id, result, similarity,
                threshold, sample_count, enrollment_version
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE id = id
            `, [
              id, input.sessionId, input.profileId, input.moodleUserId, input.result,
              input.similarity, input.threshold, input.sampleCount, input.enrollmentVersion
            ]);
            const [rows] = await connection.execute(checkSelect('session_id = ?'), [input.sessionId]);
            return mapCheck(rows[0]);
          },
          async insertProfile(input) {
            const id = crypto.randomUUID();
            await connection.execute(`
              INSERT INTO proctoring_biometric_profiles (
                id, moodle_user_id, algorithm, descriptor_ciphertext, descriptor_length,
                encryption_iv, encryption_tag, enrollment_version, status, consent_version,
                consented_at, enrolled_at, revoked_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              id, input.moodleUserId, 'human-faceres-v1', input.descriptorCiphertext,
              input.descriptorLength, input.encryptionIv, input.encryptionTag,
              input.enrollmentVersion, input.status, input.consentVersion,
              toMysqlDate(input.consentedAt), toMysqlDate(input.enrolledAt), input.revokedAt
                ? toMysqlDate(input.revokedAt)
                : null
            ]);
            const [rows] = await connection.execute(profileSelect('id = ?'), [id]);
            profile = mapProfile(rows[0]);
            return profile;
          },
          async recordAudit(input) {
            await connection.execute(`
              INSERT INTO proctoring_biometric_audit (
                profile_id, session_id, moodle_user_id, action, metadata
              ) VALUES (?, ?, ?, ?, ?)
            `, [
              input.profileId ?? null,
              input.sessionId ?? null,
              input.moodleUserId,
              input.action,
              JSON.stringify(input.metadata ?? {})
            ]);
          },
          async updateProfile(input) {
            await connection.execute(`
              UPDATE proctoring_biometric_profiles
              SET descriptor_ciphertext = ?, descriptor_length = ?, encryption_iv = ?,
                encryption_tag = ?, enrollment_version = ?, status = ?, consent_version = ?,
                consented_at = ?, enrolled_at = ?, revoked_at = NULL,
                updated_at = UTC_TIMESTAMP(3)
              WHERE id = ?
            `, [
              input.descriptorCiphertext, input.descriptorLength, input.encryptionIv,
              input.encryptionTag, input.enrollmentVersion, input.status, input.consentVersion,
              toMysqlDate(input.consentedAt), toMysqlDate(input.enrolledAt), profile.id
            ]);
            const [rows] = await connection.execute(profileSelect('id = ?'), [profile.id]);
            profile = mapProfile(rows[0]);
            return profile;
          },
          async updateVerifiedAt(profileId) {
            await connection.execute(`
              UPDATE proctoring_biometric_profiles
              SET last_verified_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)
              WHERE id = ?
            `, [profileId]);
          }
        };
        const result = await callback(transaction);
        await connection.commit();
        transactionOpen = false;
        return result;
      } catch (error) {
        if (transactionOpen) {
          await connection.rollback();
        }
        throw error;
      } finally {
        if (namedLockAcquired) {
          await connection.execute(
            'SELECT RELEASE_LOCK(?)',
            [`proctoring:biometric:${moodleUserId}`]
          );
        }
        connection.release();
      }
    },

    async reset(moodleUserId, actorMoodleUserId) {
      const connection = await pool.getConnection();
      let transactionOpen = false;
      let namedLockAcquired = false;
      try {
        const [lockRows] = await connection.execute(
          'SELECT GET_LOCK(?, 10) AS acquired',
          [`proctoring:biometric:${moodleUserId}`]
        );
        namedLockAcquired = Number(lockRows[0]?.acquired) === 1;
        if (!namedLockAcquired) {
          throw new Error('Unable to acquire biometric profile lock');
        }
        await connection.beginTransaction();
        transactionOpen = true;
        const [rows] = await connection.execute(
          profileSelect('moodle_user_id = ? FOR UPDATE'),
          [moodleUserId]
        );
        if (rows.length === 0) {
          await connection.rollback();
          transactionOpen = false;
          return null;
        }

        const profile = mapProfile(rows[0]);
        await connection.execute(`
          UPDATE proctoring_biometric_profiles
          SET status = 'revoked', revoked_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)
          WHERE id = ?
        `, [profile.id]);
        await connection.execute(`
          INSERT INTO proctoring_biometric_audit (
            profile_id, moodle_user_id, action, metadata
          ) VALUES (?, ?, 'reset', ?)
        `, [profile.id, moodleUserId, JSON.stringify({ actorMoodleUserId })]);
        await connection.commit();
        transactionOpen = false;
        return { moodleUserId, state: 'revoked' };
      } catch (error) {
        if (transactionOpen) {
          await connection.rollback();
        }
        throw error;
      } finally {
        if (namedLockAcquired) {
          await connection.execute(
            'SELECT RELEASE_LOCK(?)',
            [`proctoring:biometric:${moodleUserId}`]
          );
        }
        connection.release();
      }
    },

    async close() {
      await pool.end();
    }
  };
}

function profileSelect(condition) {
  return `
    SELECT id, moodle_user_id, algorithm, descriptor_ciphertext, descriptor_length,
      encryption_iv, encryption_tag, enrollment_version, status, consent_version,
      consented_at, enrolled_at, last_verified_at, revoked_at, created_at, updated_at
    FROM proctoring_biometric_profiles
    WHERE ${condition}
  `;
}

function checkSelect(condition) {
  return `
    SELECT id, session_id, profile_id, moodle_user_id, result, similarity,
      threshold, sample_count, enrollment_version, created_at
    FROM proctoring_biometric_checks
    WHERE ${condition}
  `;
}

function mapProfile(row) {
  return {
    algorithm: row.algorithm,
    consentedAt: toIsoDate(row.consented_at),
    consentVersion: row.consent_version,
    createdAt: toIsoDate(row.created_at),
    descriptorCiphertext: row.descriptor_ciphertext,
    descriptorLength: Number(row.descriptor_length),
    enrolledAt: toIsoDate(row.enrolled_at),
    enrollmentVersion: Number(row.enrollment_version),
    encryptionIv: row.encryption_iv,
    encryptionTag: row.encryption_tag,
    id: row.id,
    lastVerifiedAt: row.last_verified_at ? toIsoDate(row.last_verified_at) : null,
    moodleUserId: row.moodle_user_id,
    revokedAt: row.revoked_at ? toIsoDate(row.revoked_at) : null,
    status: row.status,
    updatedAt: toIsoDate(row.updated_at)
  };
}

function mapCheck(row) {
  return {
    createdAt: toIsoDate(row.created_at),
    enrollmentVersion: Number(row.enrollment_version),
    id: row.id,
    moodleUserId: row.moodle_user_id,
    profileId: row.profile_id,
    result: row.result,
    sampleCount: Number(row.sample_count),
    sessionId: row.session_id,
    similarity: row.similarity === null ? null : Number(row.similarity),
    threshold: Number(row.threshold)
  };
}

function mapProfileSummary(row) {
  return {
    enrolledAt: toIsoDate(row.enrolled_at),
    enrollmentVersion: Number(row.enrollment_version),
    lastVerifiedAt: row.last_verified_at ? toIsoDate(row.last_verified_at) : null,
    moodleUserId: row.moodle_user_id,
    revokedAt: row.revoked_at ? toIsoDate(row.revoked_at) : null,
    status: row.status
  };
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

function offset(query) {
  return (query.page - 1) * query.pageSize;
}
