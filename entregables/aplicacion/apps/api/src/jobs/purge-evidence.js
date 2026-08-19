import { loadConfig } from '../config.js';
import { createEvidenceRepository } from '../repositories/evidence-repository.js';
import { createEvidenceEncryptionService } from '../services/evidence-encryption-service.js';
import { createEvidenceService } from '../services/evidence-service.js';
import { createObjectStorageService } from '../services/object-storage-service.js';

const config = loadConfig();
const repository = createEvidenceRepository(config.databaseUrl);
const service = createEvidenceService({
  encryptionService: createEvidenceEncryptionService(config.evidenceEncryptionKey),
  objectStorage: createObjectStorageService(config.objectStorage),
  repository,
  retentionDays: config.evidenceRetentionDays
});

try {
  const deleted = await service.purgeExpired();
  console.log(JSON.stringify({ deleted, status: 'ok' }));
} finally {
  await repository.close();
}
