export async function requestCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('camera_not_supported');
  }

  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: 'user',
      height: { ideal: 480 },
      width: { ideal: 640 }
    }
  });
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function captureReference(video) {
  const canvas = document.createElement('canvas');
  const width = Math.min(video.videoWidth || 640, 640);
  const ratio = width / (video.videoWidth || 640);
  canvas.width = width;
  canvas.height = Math.round((video.videoHeight || 480) * ratio);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}
