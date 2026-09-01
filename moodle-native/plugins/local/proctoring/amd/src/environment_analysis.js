define([], function() {
  async function analyze(frame, detector) {
    if (typeof detector !== 'function') {
      return {signals: []};
    }
    const result = await detector(frame);
    return {signals: Array.isArray(result) ? result : []};
  }

  return {analyze};
});
