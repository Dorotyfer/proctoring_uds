export async function requestCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera API is unavailable');
  }

  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  });
}

export function stopCamera(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}
