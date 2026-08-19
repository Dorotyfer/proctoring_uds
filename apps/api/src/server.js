import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createEventRepository } from './repositories/event-repository.js';
import { createSessionRepository } from './repositories/session-repository.js';
import { createEventService } from './services/event-service.js';
import { createSessionService } from './services/session-service.js';

const config = loadConfig();
const repository = createSessionRepository(config.databaseUrl);
const eventRepository = createEventRepository(config.databaseUrl);
const sessionService = createSessionService(repository);
const app = await buildApp({
  eventService: createEventService(sessionService, eventRepository),
  healthService: { check: () => repository.ping() },
  jwtSecret: config.jwtSecret,
  moodleIntegrationKey: config.moodleIntegrationKey,
  sessionService
});

async function stop() {
  await app.close();
  await eventRepository.close();
  await repository.close();
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await app.listen({ host: config.host, port: config.port });
