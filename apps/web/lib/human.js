export async function createHumanDetector() {
  const { default: Human } = await import('@/generated/human.esm.js');
  const human = new Human({
    backend: 'webgl',
    body: { enabled: false },
    face: {
      detector: { rotation: true },
      enabled: true,
      mesh: { enabled: true },
      description: { enabled: true, skipFrames: 0, skipTime: 0 }
    },
    gesture: { enabled: false },
    hand: { enabled: false },
    modelBasePath: '/models',
    object: { enabled: false }
  });
  await human.load();
  return human;
}

export function detectFrame(human, video) {
  return human.detect(video);
}
