define([], function() {
  function createPairing(sessionid, lifetime = 120000) {
    const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return {
      state: 'pairing',
      sessionid,
      pairingcode: token,
      expiresat: Date.now() + lifetime
    };
  }

  async function pair(pairing, transport) {
    if (!pairing || pairing.state !== 'pairing' || Date.now() >= pairing.expiresat) {
      throw new Error('pairing_expired');
    }
    if (typeof transport !== 'function') {
      throw new Error('pairing_unavailable');
    }
    const result = await transport({sessionid: pairing.sessionid, pairingcode: pairing.pairingcode});
    return {...pairing, state: 'paired', result};
  }

  return {createPairing, pair};
});
