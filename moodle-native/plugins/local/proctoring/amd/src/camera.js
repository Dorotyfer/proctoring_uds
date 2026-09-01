define([], function() {
  const DEFAULT_CONSTRAINTS = Object.freeze({video: true, audio: false});

  async function request(constraints = DEFAULT_CONSTRAINTS) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      const permissionError = new Error('camera_denied');
      permissionError.cause = error;
      throw permissionError;
    }
  }

  function captureJpeg(video, quality = 0.85) {
    if (!video || !video.videoWidth || !video.videoHeight) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  }

  function stop(stream) {
    stream?.getTracks?.().forEach((track) => track.stop());
  }

  return {request, captureJpeg, stop};
});
