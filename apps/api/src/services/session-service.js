import { CreateSessionInput } from '@proctoring/contracts';

import { validatePolicy } from './policy-service.js';

export class IdentityDocumentRequiredError extends Error {}
export class IdentityDocumentUnavailableError extends Error {}

export function createSessionService(repository, evidenceService, biometricService = null) {
  return {
    async create(input) {
      const parsed = CreateSessionInput.parse(input);
      return repository.create({
        ...parsed,
        policySnapshot: validatePolicy(parsed.policySnapshot),
        policyVersion: parsed.policySnapshot.version
      });
    },
    async getActive(id) {
      const session = await repository.findById(id);
      if (!session || !['pending', 'active'].includes(session.status) || Date.parse(session.expiresAt) <= Date.now()) {
        return null;
      }
      return session;
    },
    async get(id) {
      return repository.findById(id);
    },
    async complete(id) {
      return repository.complete(id);
    },
    async activate(id, preparation) {
      const current = await repository.findById(id);
      if (!current || !['pending', 'active'].includes(current.status) || Date.parse(current.expiresAt) <= Date.now()) {
        return null;
      }
      let identityDocumentEvidenceId = current.identityDocumentEvidenceId ?? null;
      if (biometricService) {
        const biometricStatus = await biometricService.getStatus(current.moodleUserId);
        const requiresIdentityDocument = ['unregistered', 'revoked'].includes(biometricStatus.state) &&
          !identityDocumentEvidenceId;
        if (requiresIdentityDocument && !preparation.documentCapture) {
          throw new IdentityDocumentRequiredError('Identity document photo is required before enrollment');
        }
        if (requiresIdentityDocument) {
          try {
            const evidence = await evidenceService.storeIdentityDocument(id, preparation.documentCapture);
            identityDocumentEvidenceId = evidence.id;
            const attached = await repository.attachIdentityDocumentEvidence(id, evidence.id);
            if (attached === false) {
              throw new Error('Session no longer accepts identity document evidence');
            }
          } catch (error) {
            throw new IdentityDocumentUnavailableError('Identity document storage is unavailable', { cause: error });
          }
        }
      }
      const biometric = biometricService
        ? await biometricService.enrollOrVerify({
          biometricConsentAccepted: preparation.biometricConsentAccepted,
          biometricSamples: preparation.biometricSamples,
          moodleUserId: current.moodleUserId,
          sessionId: id
        })
        : null;
      const evidence = await evidenceService.storeIdentity(id, preparation.referenceCapture);
      const session = await repository.activate(id, {
        evidenceId: evidence.id,
        identityDocumentEvidenceId,
        livenessChallenge: preparation.livenessChallenge
      });
      return biometricService ? { biometric, session } : session;
    }
  };
}
