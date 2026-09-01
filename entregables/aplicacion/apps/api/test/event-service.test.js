import assert from 'node:assert/strict';
import test from 'node:test';

import { createEventService, EventTimestampError, SessionUnavailableError } from '../src/services/event-service.js';

const sessionId = 'e3d9cce1-a5b8-4bfe-88e1-68a57475266d';
const input = {
  clientEventId: '56cc96a8-2ff1-41ca-9917-dd967c297319',
  type: 'face_absent',
  occurredAt: new Date().toISOString(),
  metadata: {}
};

test('validates session state and event timestamps before persistence', async () => {
  const persisted = [];
  const repository = {
    async create(receivedSessionId, event) {
      persisted.push(event);
      return { sessionId: receivedSessionId, ...event };
    }
  };
  const activeSessionService = {
    async getActive() {
      return { issuedAt: new Date(Date.now() - 60_000).toISOString() };
    }
  };
  const service = createEventService(activeSessionService, repository, {
    async classify() { return null; }
  });
  await service.record(sessionId, input);

  assert.equal(persisted.length, 1);
  await assert.rejects(
    () => service.record(sessionId, { ...input, occurredAt: '2099-01-01T00:00:00.000Z' }),
    EventTimestampError
  );
});

test('rejects events when the session is unavailable', async () => {
  const service = createEventService(
    { async getActive() { return null; } },
    { async create() { throw new Error('must not persist'); } },
    { async classify() { throw new Error('must not classify'); } }
  );

  await assert.rejects(() => service.record(sessionId, input), SessionUnavailableError);
});
