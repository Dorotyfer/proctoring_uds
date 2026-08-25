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
  const sourceWidth = video.videoWidth || 640;
  const sourceHeight = video.videoHeight || 480;
  const qualities = [0.72, 0.58, 0.45, 0.32];
  let width = Math.min(sourceWidth, 640);
  let capture;

  while (width >= 320) {
    const ratio = width / sourceWidth;
    canvas.width = Math.round(width);
    canvas.height = Math.round(sourceHeight * ratio);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    for (const quality of qualities) {
      capture = canvas.toDataURL('image/jpeg', quality);
      if (dataUrlByteSize(capture) <= 200 * 1024) {
        return capture;
      }
    }
    width = Math.floor(width * 0.8);
  }

  return capture && dataUrlByteSize(capture) <= 200 * 1024 ? capture : null;
}

function dataUrlByteSize(dataUrl) {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Math.floor(base64.length * 3 / 4);
}
