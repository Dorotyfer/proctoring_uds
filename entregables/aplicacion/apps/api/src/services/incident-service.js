export function createIncidentService(eventService, evidenceRepository, evidenceService) {
  return {
    async record(sessionId, input) {
      const result = await eventService.record(sessionId, {
        clientEventId: input.clientEventId,
        metadata: input.metadata,
        occurredAt: input.occurredAt,
        type: input.type
      });
      const existing = await evidenceRepository.findByEventId(result.event.id);
      const evidence = existing || (input.capture
        ? await evidenceService.storeCapture(sessionId, 'alert', input.capture, { eventId: result.event.id })
        : null);

      return { ...result, evidence };
    }
  };
}
