define([], function() {
  async function collect(capture, count = 3) {
    const samples = [];
    for (let index = 0; index < count; index += 1) {
      const sample = await capture(index);
      if (!sample) {
        throw new Error('enrollment_capture_failed');
      }
      samples.push(sample);
    }
    return samples;
  }

  return {collect};
});
