define(['core/ajax'], function(Ajax) {
  function load(sessionid) {
    return Ajax.call([{methodname: 'local_proctoring_get_session_detail', args: {sessionid}}])[0]
      .then((payload) => JSON.parse(payload));
  }

  return {load};
});
