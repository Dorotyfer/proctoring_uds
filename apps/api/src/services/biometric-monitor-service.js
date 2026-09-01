export class BiometricMonitorSessionUnavailableError extends Error {}

export function createBiometricMonitorService({ sessionService, biometricService, incidentService }) {
  return {
    async check(sessionId, input) {
      const session = await sessionService.getActive(sessionId);
      if (!session) {
        throw new BiometricMonitorSessionUnavailableError('Active session not found');
      }

      const result = await biometricService.verifyContinuous({
        ...input,
        moodleUserId: session.moodleUserId,
        sessionId
      });
      let alertId = null;
      if (result.status === 'mismatch' && incidentService) {
        const incident = await incidentService.record(sessionId, {
          capture: input.capture ?? null,
          clientEventId: input.clientCheckId,
          metadata: {
            mismatchedSamples: result.mismatchedSamples,
            profileVersionId: result.profileVersionId ?? null,
            similarity: result.similarity,
            source: 'biometric_monitor',
            threshold: result.threshold
          },
          occurredAt: input.occurredAt,
          type: 'biometric_monitor_mismatch'
        });
        alertId = incident.alert?.id ?? null;
      }

      return {
        check: {
          alertId,
          id: result.checkId,
          similarity: result.similarity ?? null,
          status: result.status,
          threshold: result.threshold
        }
      };
    }
  };
}
