import crypto from 'node:crypto';

export function createBiometricEncryptionService(key) {
  return {
    encryptDescriptor(descriptor) {
      const plaintext = Buffer.alloc(descriptor.length * 4);
      descriptor.forEach((value, index) => plaintext.writeFloatLE(value, index * 4));
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

      return {
        ciphertext,
        descriptorLength: descriptor.length,
        iv,
        tag: cipher.getAuthTag()
      };
    },
    decryptDescriptor(input) {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, input.iv);
      decipher.setAuthTag(input.tag);
      const plaintext = Buffer.concat([decipher.update(input.ciphertext), decipher.final()]);
      if (plaintext.length !== input.descriptorLength * 4) {
        throw new Error('Encrypted biometric descriptor has an invalid length');
      }

      return Array.from({ length: input.descriptorLength }, (_, index) => plaintext.readFloatLE(index * 4));
    }
  };
}
