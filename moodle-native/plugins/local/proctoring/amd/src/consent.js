define([], function() {
  function accepted(value) {
    return value === true;
  }

  function payload(version, acceptedAt = Date.now()) {
    return {
      version: String(version || 'native-consent-v1'),
      accepted: true,
      acceptedAt
    };
  }

  return {accepted, payload};
});
