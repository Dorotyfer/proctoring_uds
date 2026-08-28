import {
  compareBiometricSamples,
  DEFAULT_BIOMETRIC_THRESHOLD,
  selectStableDescriptor,
  validateBiometricSamples
} from './biometric-matching-service.js';

export class BiometricConsentRequiredError extends Error {}
export class BiometricUnavailableError extends Error {}

export function createBiometricProfileService(options) {
  const threshold = options.threshold ?? DEFAULT_BIOMETRIC_THRESHOLD;

  return {
    async getStatus(moodleUserId) {
      const profile = await options.repository.findByUserId(moodleUserId);
      if (!profile) {
        return { enrollmentVersion: null, state: 'unregistered' };
      }
      return {
        enrollmentVersion: profile.enrollmentVersion,
        state: profile.status === 'revoked' ? 'revoked' : 'enrolled'
      };
    },

    async enrollOrVerify(input) {
      const samples = validateBiometricSamples(input.biometricSamples);
      try {
        return await options.repository.withUserLock(input.moodleUserId, async (transaction) => {
        const existingCheck = await transaction.findCheckBySessionId(input.sessionId);
        if (existingCheck) {
          return mapCheck(existingCheck);
        }

        const profile = await transaction.getProfile();
        if (!profile || profile.status === 'revoked') {
          if (input.biometricConsentAccepted !== true) {
            throw new BiometricConsentRequiredError('Biometric consent is required before enrollment');
          }

          const descriptor = selectStableDescriptor(samples);
          const encrypted = options.encryptionService.encryptDescriptor(descriptor);
          const enrollmentVersion = profile ? profile.enrollmentVersion + 1 : 1;
          const savedProfile = profile ?? await transaction.insertProfile({
              consentVersion: input.consentVersion ?? 'biometric-v1',
              consentedAt: input.consentedAt ?? new Date(),
              descriptorCiphertext: encrypted.ciphertext,
              descriptorLength: encrypted.descriptorLength,
              encryptionIv: encrypted.iv,
              encryptionTag: encrypted.tag,
              enrollmentVersion,
              enrolledAt: new Date(),
              moodleUserId: input.moodleUserId,
              revokedAt: null,
              status: 'active'
          });
          let profileVersionId = savedProfile.id;
          if (typeof transaction.insertProfileVersion === 'function') {
            if (profile?.activeVersionId && typeof transaction.revokeProfileVersion === 'function') {
              await transaction.revokeProfileVersion(profile.activeVersionId);
            }
            const version = await transaction.insertProfileVersion({
              algorithm: 'human-faceres-v1',
              consentVersion: input.consentVersion ?? 'biometric-v1',
              consentedAt: input.consentedAt ?? new Date(),
              descriptorCiphertext: encrypted.ciphertext,
              descriptorLength: encrypted.descriptorLength,
              encryptionIv: encrypted.iv,
              encryptionTag: encrypted.tag,
              enrolledAt: new Date(),
              profileId: savedProfile.id,
              revokedAt: null,
              status: 'active',
              version: enrollmentVersion
            });
            profileVersionId = version.id;
            await transaction.activateProfileVersion(profileVersionId, enrollmentVersion);
          } else if (profile) {
            await transaction.updateProfile({
              consentVersion: input.consentVersion ?? 'biometric-v1',
              consentedAt: input.consentedAt ?? new Date(),
              descriptorCiphertext: encrypted.ciphertext,
              descriptorLength: encrypted.descriptorLength,
              encryptionIv: encrypted.iv,
              encryptionTag: encrypted.tag,
              enrollmentVersion,
              enrolledAt: new Date(),
              revokedAt: null,
              status: 'active'
            });
          }
          const check = await transaction.insertCheck({
            enrollmentVersion,
            moodleUserId: input.moodleUserId,
            profileId: savedProfile.id,
            profileVersionId,
            result: 'enrolled',
            sampleCount: samples.length,
            sessionId: input.sessionId,
            similarity: null,
            threshold
          });
          await transaction.recordAudit({
            action: 'enroll',
            moodleUserId: input.moodleUserId,
            profileId: savedProfile.id,
            profileVersionId,
            sessionId: input.sessionId
          });
          return {
            alertId: null,
            checkId: check.id,
            enrollmentVersion,
            mismatchedSamples: 0,
            profileId: savedProfile.id,
            profileVersionId,
            similarity: null,
            status: 'enrolled',
            threshold
          };
        }

        const reference = options.encryptionService.decryptDescriptor({
          ciphertext: profile.descriptorCiphertext,
          descriptorLength: profile.descriptorLength,
          iv: profile.encryptionIv,
          tag: profile.encryptionTag
        });
        const comparison = compareBiometricSamples(samples, reference, threshold);
        const check = await transaction.insertCheck({
          enrollmentVersion: profile.enrollmentVersion,
          moodleUserId: input.moodleUserId,
          profileId: profile.id,
          profileVersionId: profile.activeVersionId ?? profile.id,
          result: comparison.status,
          sampleCount: samples.length,
          sessionId: input.sessionId,
          similarity: comparison.similarity,
          threshold
        });
        await transaction.updateVerifiedAt(profile.id);
        await transaction.recordAudit({
          action: 'verify',
          moodleUserId: input.moodleUserId,
          profileId: profile.id,
          profileVersionId: profile.activeVersionId ?? profile.id,
          sessionId: input.sessionId
        });
        return {
          alertId: null,
          checkId: check.id,
          enrollmentVersion: profile.enrollmentVersion,
          mismatchedSamples: comparison.mismatchedSamples,
          profileId: profile.id,
          profileVersionId: profile.activeVersionId ?? profile.id,
          similarity: comparison.similarity,
          status: comparison.status,
          threshold
        };
        });
      } catch (error) {
        if (error instanceof BiometricConsentRequiredError || error instanceof TypeError) {
          throw error;
        }
        throw new BiometricUnavailableError('Biometric profile storage is unavailable', { cause: error });
      }
    },

    async verifyContinuous(input) {
      const samples = validateBiometricSamples(input.biometricSamples);
      try {
        return await options.repository.withUserLock(input.moodleUserId, async (transaction) => {
          const existing = typeof transaction.findMonitorCheck === 'function'
            ? await transaction.findMonitorCheck(input.sessionId, input.clientCheckId)
            : null;
          if (existing) {
            return mapMonitorCheck(existing);
          }

          const profile = await transaction.getProfile();
          if (!profile || profile.status === 'revoked' || !profile.descriptorCiphertext) {
            const check = await transaction.insertMonitorCheck({
              clientCheckId: input.clientCheckId,
              moodleUserId: input.moodleUserId,
              profileId: profile?.id ?? null,
              profileVersionId: profile?.activeVersionId ?? null,
              result: 'unavailable',
              sampleCount: samples.length,
              sessionId: input.sessionId,
              similarity: null,
              threshold
            });
            return mapMonitorCheck(check);
          }

          const reference = options.encryptionService.decryptDescriptor({
            ciphertext: profile.descriptorCiphertext,
            descriptorLength: profile.descriptorLength,
            iv: profile.encryptionIv,
            tag: profile.encryptionTag
          });
          const comparison = compareBiometricSamples(samples, reference, threshold);
          const check = await transaction.insertMonitorCheck({
            clientCheckId: input.clientCheckId,
            moodleUserId: input.moodleUserId,
            profileId: profile.id,
            profileVersionId: profile.activeVersionId ?? profile.id,
            result: comparison.status,
            sampleCount: samples.length,
            sessionId: input.sessionId,
            similarity: comparison.similarity,
            threshold,
            mismatchedSamples: comparison.mismatchedSamples
          });
          await transaction.updateVerifiedAt(profile.id);
          await transaction.recordAudit({
            action: 'verify_monitor',
            moodleUserId: input.moodleUserId,
            profileId: profile.id,
            profileVersionId: profile.activeVersionId ?? profile.id,
            sessionId: input.sessionId
          });
          return {
            ...mapMonitorCheck(check),
            mismatchedSamples: comparison.mismatchedSamples,
            profileVersionId: profile.activeVersionId ?? profile.id
          };
        });
      } catch (error) {
        if (error instanceof TypeError) {
          throw error;
        }
        throw new BiometricUnavailableError('Biometric profile storage is unavailable', { cause: error });
      }
    }
  };
}

function mapCheck(check) {
  return {
    alertId: null,
    checkId: check.id,
    enrollmentVersion: check.enrollmentVersion,
    mismatchedSamples: check.mismatchedSamples ?? (check.result === 'mismatch' ? check.sampleCount : 0),
    profileId: check.profileId,
    profileVersionId: check.profileVersionId ?? check.profileId,
    similarity: check.similarity,
    status: check.result,
    threshold: check.threshold
  };
}

function mapMonitorCheck(check) {
  return {
    checkId: check.id,
    mismatchedSamples: check.mismatchedSamples ?? (check.result === 'mismatch' ? check.sampleCount : 0),
    profileVersionId: check.profileVersionId ?? null,
    similarity: check.similarity === null ? null : Number(check.similarity),
    status: check.result,
    threshold: Number(check.threshold)
  };
}
