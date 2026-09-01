export function normalizeDetection(detection, frameWidth, frameHeight) {
  const [x = 0, y = 0, width = 0, height = 0] = detection.box ?? [0, 0, 0, 0];
  return {
    box: {
      height: roundBounded(height / frameHeight),
      width: roundBounded(width / frameWidth),
      x: roundBounded(x / frameWidth),
      y: roundBounded(y / frameHeight)
    },
    confidence: Math.round(detection.confidence * 100) / 100,
    objectCount: 1,
    objectType: detection.label ?? detection.objectType ?? 'unknown'
  };
}

export function createEnvironmentTracker({
  allowedObjects = [],
  alertableObjects = [],
  consecutiveDetections = 3
}) {
  let lastType = null;
  let consecutive = 0;

  return {
    update(detections, frameWidth, frameHeight) {
      const candidate = (detections ?? [])
        .map((detection) => ({ detection, type: detection.label ?? detection.objectType }))
        .find(({ type }) => alertableObjects.includes(type) && !allowedObjects.includes(type));
      if (!candidate) {
        lastType = null;
        consecutive = 0;
        return null;
      }
      if (candidate.type === lastType) {
        consecutive += 1;
      } else {
        lastType = candidate.type;
        consecutive = 1;
      }
      if (consecutive < consecutiveDetections) {
        return null;
      }
      return normalizeDetection(candidate.detection, frameWidth, frameHeight);
    }
  };
}

function roundBounded(value) {
  return Math.round(Math.min(1, Math.max(0, value)) * 10000) / 10000;
}
