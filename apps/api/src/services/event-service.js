import { SessionEventInput } from '@proctoring/contracts';

export class SessionUnavailableError extends Error {}
export class EventTimestampError extends Error {}

export function createEventService(sessionService, eventRepository, alertService, onEvent = null) {
  return {
    async record(sessionId, input) {
      const parsed = SessionEventInput.parse(input);
      const session = await sessionService.getActive(sessionId);
      if (!session) {
        throw new SessionUnavailableError('Active session not found');
      }

      const occurredAt = Date.parse(parsed.occurredAt);
      const earliest = Date.parse(session.issuedAt) - 5 * 60 * 1000;
      const latest = Date.now() + 5 * 60 * 1000;
      if (occurredAt < earliest || occurredAt > latest) {
        throw new EventTimestampError('Event timestamp is outside the accepted range');
      }

      const event = await eventRepository.create(sessionId, parsed);
      const alert = await alertService.classify(event);
      onEvent?.(sessionId, {
        type: 'session.updated',
        data: {
          alert: alert ? { id: alert.id, severity: alert.severity, status: alert.status, type: alert.type } : null,
          event: { id: event.id, occurredAt: event.occurredAt, type: event.type }
        }
      });
      return { alert, event };
    }
  };
}
