const FRAME_WIDTH = 640;
const FRAME_HEIGHT = 480;
const MAX_JPEG_BYTES = 200 * 1024;
const JPEG_QUALITIES = [0.82, 0.70, 0.58, 0.46, 0.35];

export async function requestCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('camera_unsupported');
  }
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: 'user',
      width: { ideal: FRAME_WIDTH },
      height: { ideal: FRAME_HEIGHT }
    }
  });
}

export async function attachCamera(video, stream) {
  video.srcObject = stream;
  await video.play();
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('camera_timeout')), 10000);
      video.addEventListener('loadeddata', () => {
        window.clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
  }
}

export async function captureJpeg(video, canvas) {
  if (!video.srcObject || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error('camera_not_ready');
  }
  canvas.width = FRAME_WIDTH;
  canvas.height = FRAME_HEIGHT;
  const context = canvas.getContext('2d', { alpha: false });
  context.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);

  for (const quality of JPEG_QUALITIES) {
    const blob = await canvasToBlob(canvas, quality);
    if (blob.size <= MAX_JPEG_BYTES) {
      return blob;
    }
  }
  throw new Error('frame_too_large');
}

export function observeCameraInterruptions(stream, callback) {
  const removers = [];
  for (const track of stream.getVideoTracks()) {
    for (const type of ['ended', 'mute']) {
      const handler = () => callback({ source: `track-${type}` });
      track.addEventListener(type, handler);
      removers.push(() => track.removeEventListener(type, handler));
    }
  }
  return () => removers.forEach((remove) => remove());
}

export function stopCamera(stream) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== 'image/jpeg') {
        reject(new Error('jpeg_capture_failed'));
        return;
      }
      resolve(blob);
    }, 'image/jpeg', quality);
  });
}
