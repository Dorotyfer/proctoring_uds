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
        SELECT profiles.moodle_user_id, profiles.enrollment_version, profiles.status,
          profiles.enrolled_at, profiles.last_verified_at, profiles.revoked_at,
          (
            SELECT sessions.student_name
            FROM proctoring_sessions sessions
            WHERE sessions.moodle_user_id = profiles.moodle_user_id
              AND sessions.student_name IS NOT NULL
              AND sessions.student_name <> ''
            ORDER BY sessions.created_at DESC
            LIMIT 1
          ) AS student_name,
          (
            SELECT sessions.student_document
            FROM proctoring_sessions sessions
            WHERE sessions.moodle_user_id = profiles.moodle_user_id
              AND sessions.student_document IS NOT NULL
              AND sessions.student_document <> ''
            ORDER BY sessions.created_at DESC
            LIMIT 1
          ) AS student_document
        FROM proctoring_biometric_profiles profiles
        ${whereSql}
        ORDER BY profiles.enrolled_at DESC, profiles.moodle_user_id
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

    async listVersions(moodleUserId) {
      const [rows] = await pool.execute(`
        SELECT versions.id, versions.profile_id, versions.version, versions.algorithm,
          versions.consent_version, versions.consented_at, versions.enrolled_at,
          versions.revoked_at, versions.status
        FROM proctoring_biometric_profile_versions versions
        JOIN proctoring_biometric_profiles profiles ON profiles.id = versions.profile_id
        WHERE profiles.moodle_user_id = ?
        ORDER BY versions.version DESC
      `, [moodleUserId]);
      return rows.map((row) => ({
        algorithm: row.algorithm,
        consentedAt: toIsoDate(row.consented_at),
        consentVersion: row.consent_version,
        enrolledAt: toIsoDate(row.enrolled_at),
        id: row.id,
        profileId: row.profile_id,
        revokedAt: row.revoked_at ? toIsoDate(row.revoked_at) : null,
        status: row.status,
        version: Number(row.version)
      }));
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
          async findMonitorCheck(sessionId, clientCheckId) {
            const [rows] = await connection.execute(
              monitorCheckSelect('session_id = ? AND client_check_id = ?'),
              [sessionId, clientCheckId]
            );
            return rows.length === 0 ? null : mapMonitorCheck(rows[0]);
          },
          async getProfile() {
            return profile;
          },
          async insertCheck(input) {
            const id = crypto.randomUUID();
            await connection.execute(`
            INSERT INTO proctoring_biometric_checks (
                id, session_id, profile_id, moodle_user_id, result, similarity,
                threshold, sample_count, enrollment_version, profile_version_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE id = id
            `, [
              id, input.sessionId, input.profileId, input.moodleUserId, input.result,
              input.similarity, input.threshold, input.sampleCount, input.enrollmentVersion,
              input.profileVersionId ?? null
            ]);
            const [rows] = await connection.execute(checkSelect('session_id = ?'), [input.sessionId]);
            return mapCheck(rows[0]);
          },
          async insertMonitorCheck(input) {
            const id = crypto.randomUUID();
            await connection.execute(`
              INSERT INTO proctoring_biometric_monitor_checks (
                id, session_id, client_check_id, profile_version_id, sample_count,
                similarity, threshold, result, alert_event_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE id = id
            `, [
              id, input.sessionId, input.clientCheckId, input.profileVersionId ?? null,
              input.sampleCount, input.similarity, input.threshold, input.result,
              input.alertEventId ?? null
            ]);
            const [rows] = await connection.execute(
              monitorCheckSelect('session_id = ? AND client_check_id = ?'),
              [input.sessionId, input.clientCheckId]
            );
            return mapMonitorCheck(rows[0]);
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
          async insertProfileVersion(input) {
            const id = crypto.randomUUID();
            await connection.execute(`
              INSERT INTO proctoring_biometric_profile_versions (
                id, profile_id, version, algorithm, descriptor_ciphertext, descriptor_length,
                encryption_iv, encryption_tag, consent_version, consented_at, enrolled_at,
                revoked_at, status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              id, input.profileId, input.version, input.algorithm,
              input.descriptorCiphertext, input.descriptorLength, input.encryptionIv,
              input.encryptionTag, input.consentVersion, toMysqlDate(input.consentedAt),
              toMysqlDate(input.enrolledAt), input.revokedAt ? toMysqlDate(input.revokedAt) : null,
              input.status
            ]);
            return { id, ...input };
          },
          async revokeProfileVersion(versionId) {
            await connection.execute(`
              UPDATE proctoring_biometric_profile_versions
              SET status = 'revoked', revoked_at = UTC_TIMESTAMP(3)
              WHERE id = ? AND status = 'active'
            `, [versionId]);
          },
          async activateProfileVersion(versionId, enrollmentVersion) {
            await connection.execute(`
              UPDATE proctoring_biometric_profile_versions
              SET status = 'revoked', revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP(3))
              WHERE profile_id = (SELECT profile_id FROM (
                SELECT profile_id FROM proctoring_biometric_profile_versions WHERE id = ?
              ) profile_lookup) AND id <> ? AND status = 'active'
            `, [versionId, versionId]);
            await connection.execute(`
              UPDATE proctoring_biometric_profiles profiles
              JOIN proctoring_biometric_profile_versions versions ON versions.profile_id = profiles.id
              SET profiles.active_version_id = ?, profiles.enrollment_version = ?,
                profiles.status = 'active', profiles.revoked_at = NULL,
                profiles.updated_at = UTC_TIMESTAMP(3)
              WHERE versions.id = ?
            `, [versionId, enrollmentVersion, versionId]);
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
              JSON.stringify({ ...input.metadata, profileVersionId: input.profileVersionId ?? null })
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
          SET status = 'revoked', active_version_id = NULL,
            revoked_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)
          WHERE id = ?
        `, [profile.id]);
        if (profile.activeVersionId) {
          await connection.execute(`
            UPDATE proctoring_biometric_profile_versions
            SET status = 'revoked', revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP(3))
            WHERE id = ?
          `, [profile.activeVersionId]);
        }
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
    SELECT profiles.id, profiles.moodle_user_id,
      COALESCE(versions.algorithm, profiles.algorithm) AS algorithm,
      COALESCE(versions.descriptor_ciphertext, profiles.descriptor_ciphertext) AS descriptor_ciphertext,
      COALESCE(versions.descriptor_length, profiles.descriptor_length) AS descriptor_length,
      COALESCE(versions.encryption_iv, profiles.encryption_iv) AS encryption_iv,
      COALESCE(versions.encryption_tag, profiles.encryption_tag) AS encryption_tag,
      profiles.enrollment_version, profiles.status, profiles.consent_version,
      profiles.consented_at, profiles.enrolled_at, profiles.last_verified_at, profiles.revoked_at,
      profiles.active_version_id, profiles.created_at, profiles.updated_at
    FROM proctoring_biometric_profiles
    profiles LEFT JOIN proctoring_biometric_profile_versions versions
      ON versions.id = profiles.active_version_id
    WHERE ${condition.replaceAll('moodle_user_id', 'profiles.moodle_user_id').replaceAll('id =', 'profiles.id =')}
  `;
}

function checkSelect(condition) {
  return `
    SELECT id, session_id, profile_id, profile_version_id, moodle_user_id, result, similarity,
      threshold, sample_count, enrollment_version, created_at
    FROM proctoring_biometric_checks
    WHERE ${condition}
  `;
}

function monitorCheckSelect(condition) {
  return `
    SELECT id, session_id, client_check_id, profile_version_id, sample_count,
      similarity, threshold, result, alert_event_id, created_at
    FROM proctoring_biometric_monitor_checks
    WHERE ${condition}
  `;
}

function mapProfile(row) {
  return {
    algorithm: row.algorithm,
    activeVersionId: row.active_version_id ?? null,
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
    profileVersionId: row.profile_version_id ?? null,
    result: row.result,
    sampleCount: Number(row.sample_count),
    sessionId: row.session_id,
    similarity: row.similarity === null ? null : Number(row.similarity),
    threshold: Number(row.threshold)
  };
}

function mapMonitorCheck(row) {
  return {
    alertEventId: row.alert_event_id ?? null,
    clientCheckId: row.client_check_id,
    createdAt: toIsoDate(row.created_at),
    id: row.id,
    mismatchedSamples: row.result === 'mismatch' ? Number(row.sample_count) : 0,
    profileVersionId: row.profile_version_id ?? null,
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
    status: row.status,
    studentDocument: row.student_document ?? null,
    studentName: row.student_name ?? null
  };
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

function offset(query) {
  return (query.page - 1) * query.pageSize;
}
