import crypto from 'node:crypto';

export function createEvidenceService(options) {
  async function storeCapture(sessionId, kind, buffer, captureOptions = {}) {
    const encrypted = options.encryptionService.encrypt(buffer);
    const objectId = captureOptions.eventId ?? crypto.randomUUID();
    const objectKey = `${sessionId}/${kind}/${objectId}.enc`;
    await options.objectStorage.put(objectKey, encrypted.ciphertext, 'application/octet-stream');

    try {
      return await options.repository.create({
        sessionId,
        kind,
        eventId: captureOptions.eventId ?? null,
        objectKey,
        contentType: 'image/jpeg',
        byteSize: buffer.length,
        sha256: encrypted.hash,
        encryptionIv: encrypted.iv,
        encryptionTag: encrypted.tag,
        expiresAt: new Date(Date.now() + options.retentionDays * 86400000)
      });
    } catch (error) {
      await options.objectStorage.delete(objectKey).catch(() => {});
      throw error;
    }
  }

  return {
    async storeIdentity(sessionId, buffer) {
      return storeCapture(sessionId, 'identity', buffer);
    },
    async storeCapture(sessionId, kind, buffer, captureOptions = {}) {
      return storeCapture(sessionId, kind, buffer, captureOptions);
    },
    async readAuthorized(evidence) {
      const ciphertext = await options.objectStorage.get(evidence.objectKey);
      return options.encryptionService.decrypt({
        ciphertext,
        iv: evidence.encryptionIv,
        tag: evidence.encryptionTag
      });
    },
    async purgeExpired(actorId = 'system:retention') {
      const expired = await options.repository.findExpired(100);
      let deleted = 0;
      for (const evidence of expired) {
        await options.objectStorage.delete(evidence.objectKey);
        await options.repository.audit({
          evidenceId: evidence.id,
          actorId,
          action: 'retention_delete',
          ipAddress: null,
          userAgent: 'retention-job'
        });
        await options.repository.markDeleted(evidence.id);
        deleted += 1;
      }
      return deleted;
    }
  };
}
