define(['core/ajax'], function(Ajax) {
  function call(methodname, args) {
    return Ajax.call([{methodname, args}])[0];
  }

  function getAttempt(attemptid) {
    return call('local_proctoring_get_attempt', {attemptid});
  }

  function startAttempt(attemptid) {
    return call('local_proctoring_start_attempt', {attemptid});
  }

  function activateAttempt(attemptid, payload) {
    return call('local_proctoring_activate_attempt', {
      attemptid,
      prepared: payload.prepared === true,
      consent: payload.consent === true,
      devicemode: payload.devicemode || 'browser'
    });
  }

  function completeAttempt(attemptid) {
    return call('local_proctoring_complete_attempt', {attemptid});
  }

  function recordEvents(attemptid, events) {
    return call('local_proctoring_record_events', {
      attemptid,
      events: events.map((event) => ({
        clienteventid: event.clienteventid,
        type: event.type,
        occurredat: event.occurredat,
        metadata: JSON.stringify(event.metadata || {})
      }))
    });
  }

  function recordIncident(attemptid, incident) {
    return call('local_proctoring_record_incident', {
      attemptid,
      incident: {
        type: incident.type,
        occurredat: incident.occurredat || Date.now(),
        clienteventid: incident.clienteventid,
        metadata: JSON.stringify(incident.metadata || {})
      }
    });
  }

  return {getAttempt, startAttempt, activateAttempt, completeAttempt, recordEvents, recordIncident};
});
