define([], function() {
  async function start(onSignal) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('audio_unavailable');
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({video: false, audio: true});
    } catch (error) {
      const unavailable = new Error('audio_unavailable');
      unavailable.cause = error;
      throw unavailable;
    }
    onSignal?.({type: 'audio_ready', occurredat: Date.now(), metadata: {}});
    return {
      stream,
      stop: () => stream.getTracks().forEach((track) => track.stop())
    };
  }

  return {start};
});
