import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createAlertRepository } from './repositories/alert-repository.js';
import { createEventRepository } from './repositories/event-repository.js';
import { createEvidenceRepository } from './repositories/evidence-repository.js';
import { createPanelRepository } from './repositories/panel-repository.js';
import { createSessionRepository } from './repositories/session-repository.js';
import { createAlertService } from './services/alert-service.js';
import { createEvidenceEncryptionService } from './services/evidence-encryption-service.js';
import { createEvidenceService } from './services/evidence-service.js';
import { createEventService } from './services/event-service.js';
import { createSessionService } from './services/session-service.js';
import { createObjectStorageService } from './services/object-storage-service.js';
import { createPanelAuthService } from './services/panel-auth-service.js';
import { createResilientObjectStorage } from './services/resilient-object-storage.js';

const config = loadConfig();
const repository = createSessionRepository(config.databaseUrl);
const eventRepository = createEventRepository(config.databaseUrl);
const alertRepository = createAlertRepository(config.databaseUrl);
const evidenceRepository = createEvidenceRepository(config.databaseUrl);
const panelRepository = createPanelRepository(config.databaseUrl);
const alertService = createAlertService(alertRepository);
const evidenceService = createEvidenceService({
  encryptionService: createEvidenceEncryptionService(config.evidenceEncryptionKey),
  objectStorage: createResilientObjectStorage(createObjectStorageService(config.objectStorage)),
  repository: evidenceRepository,
  retentionDays: config.evidenceRetentionDays
});
const sessionService = createSessionService(
  repository,
  evidenceService
);
const app = await buildApp({
  eventService: createEventService(sessionService, eventRepository, alertService),
  evidenceService,
  healthService: { check: () => repository.ping() },
  jwtSecret: config.jwtSecret,
  moodleIntegrationKey: config.moodleIntegrationKey,
  panel: {
    apiOrigin: config.apiOrigin,
    authService: createPanelAuthService(config.panelSsoSecret),
    cookieName: 'proctoring_panel',
    evidenceRepository,
    evidenceService,
    repository: panelRepository,
    secureCookies: config.apiOrigin.startsWith('https://'),
    webOrigin: config.webOrigin
  },
  sessionService,
  webOrigin: config.webOrigin
});

async function stop() {
  await app.close();
  await alertRepository.close();
  await evidenceRepository.close();
  await eventRepository.close();
  await panelRepository.close();
  await repository.close();
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await app.listen({ host: config.host, port: config.port });
