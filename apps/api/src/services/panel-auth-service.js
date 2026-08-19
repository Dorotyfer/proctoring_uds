import crypto from 'node:crypto';

export const PANEL_CAPABILITIES = {
  institution: 'local/proctoring:viewinstitutionreports',
  review: 'local/proctoring:reviewowncoursealerts',
  view: 'local/proctoring:viewowncoursereports',
  viewEvidence: 'local/proctoring:viewbiometricevidence'
};

export function createPanelAuthService(secret) {
  return {
    verifyMoodleToken(token) {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }
      const expected = sign(`${parts[0]}.${parts[1]}`, secret);
      if (!safeEqual(parts[2], expected)) {
        return null;
      }
      try {
        const header = JSON.parse(fromBase64Url(parts[0]));
        const payload = JSON.parse(fromBase64Url(parts[1]));
        if (header.alg !== 'HS256' || payload.aud !== 'proctoring-panel-sso' || payload.exp * 1000 <= Date.now()) {
          return null;
        }
        if (typeof payload.moodleUserId !== 'string' || !Array.isArray(payload.capabilities) ||
          !Array.isArray(payload.courseIds) || !Array.isArray(payload.reviewCourseIds)) {
          return null;
        }
        return payload;
      } catch {
        return null;
      }
    },
    scope(claims) {
      return {
        courseIds: claims.courseIds.map(String),
        institutional: claims.capabilities.includes(PANEL_CAPABILITIES.institution)
      };
    },
    reviewScope(claims) {
      return {
        courseIds: claims.reviewCourseIds.map(String),
        institutional: claims.capabilities.includes(PANEL_CAPABILITIES.institution)
      };
    },
    canView(claims) {
      return claims.capabilities.includes(PANEL_CAPABILITIES.view) ||
        claims.capabilities.includes(PANEL_CAPABILITIES.institution);
    },
    canReview(claims) {
      return claims.capabilities.includes(PANEL_CAPABILITIES.review) ||
        claims.capabilities.includes(PANEL_CAPABILITIES.institution);
    },
    canViewEvidence(claims) {
      return claims.capabilities.includes(PANEL_CAPABILITIES.viewEvidence);
    }
  };
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function fromBase64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}
