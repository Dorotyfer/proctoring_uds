define([], function() {
  function create(attemptid, sender) {
    const queue = [];
    let inFlight = null;

    function push(event) {
      queue.push({...event, attemptid});
    }

    function flush() {
      if (inFlight) {
        return inFlight;
      }
      if (!queue.length) {
        return Promise.resolve();
      }
      const batch = queue.slice();
      inFlight = Promise.resolve(sender(batch)).then(() => {
        queue.splice(0, batch.length);
      }).finally(() => {
        inFlight = null;
      });
      return inFlight;
    }

    return {push, flush, size: () => queue.length};
  }

  return {create};
});
