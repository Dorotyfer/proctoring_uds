define([], function() {
  async function analyze(video, detector) {
    if (typeof detector !== 'function') {
      return {signals: []};
    }
    const result = await detector(video);
    return {signals: Array.isArray(result) ? result : []};
  }

  return {analyze};
});
