let humanPromise;

async function loadHuman() {
  if (typeof window === 'undefined') {
    throw new Error('Human analysis is only available in the browser');
  }

  if (!humanPromise) {
    humanPromise = import('@vladmandic/human').then(({ Human }) => new Human({
      backend: 'webgl',
      face: { enabled: true, detector: { rotation: true }, mesh: { enabled: false } },
      body: { enabled: false },
      hand: { enabled: false },
      object: { enabled: false },
      gesture: { enabled: false }
    }));
  }

  return humanPromise;
}

export async function analyzeFrame(video) {
  const human = await loadHuman();
  return human.detect(video);
}
