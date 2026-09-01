define([], function() {
  const ACTIONS = Object.freeze(['blink', 'turn_left', 'turn_right']);

  function createChallenge() {
    return ACTIONS.map((action, index) => ({action, order: index + 1}));
  }

  function verify(challenge, responses) {
    if (!Array.isArray(challenge) || !Array.isArray(responses) || challenge.length !== responses.length) {
      return false;
    }
    return challenge.every((item, index) => responses[index]?.action === item.action && responses[index]?.passed === true);
  }

  return {createChallenge, verify};
});
