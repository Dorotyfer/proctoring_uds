import crypto from 'node:crypto';

export function createEvidenceEncryptionService(key) {
  return {
    encrypt(buffer) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);

      return {
        ciphertext,
        hash: crypto.createHash('sha256').update(buffer).digest('hex'),
        iv,
        tag: cipher.getAuthTag()
      };
    },
    decrypt(input) {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, input.iv);
      decipher.setAuthTag(input.tag);
      return Buffer.concat([decipher.update(input.ciphertext), decipher.final()]);
    }
  };
}
