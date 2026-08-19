const eyeLandmarks = {
  left: [33, 160, 158, 133, 153, 144],
  right: [362, 385, 387, 263, 373, 380]
};

function distance(first, second) {
  return Math.hypot(first[0] - second[0], first[1] - second[1]);
}

function eyeAspectRatio(mesh, indices) {
  const points = indices.map((index) => mesh[index]);
  if (points.some((point) => !point)) {
    return null;
  }
  const vertical = distance(points[1], points[5]) + distance(points[2], points[4]);
  const horizontal = 2 * distance(points[0], points[3]);
  return horizontal === 0 ? null : vertical / horizontal;
}

export function describeFaceState(result, frame) {
  const faces = result?.face ?? [];
  if (faces.length === 0) {
    return { state: 'absent' };
  }
  if (faces.length > 1) {
    return { state: 'multiple' };
  }

  const [x, y, width, height] = faces[0].box ?? [0, 0, 0, 0];
  const marginX = frame.width * 0.04;
  const marginY = frame.height * 0.04;
  const framed = x >= marginX && y >= marginY
    && x + width <= frame.width - marginX
    && y + height <= frame.height - marginY
    && width * height >= frame.width * frame.height * 0.08;

  return { face: faces[0], state: framed ? 'valid' : 'out-of-frame' };
}

export function createLivenessChallenge(random = crypto.getRandomValues(new Uint32Array(1))[0]) {
  const steps = ['blink', 'turn-left', 'turn-right'];
  const firstIndex = random % steps.length;
  const secondIndex = (firstIndex + 1 + Math.floor(random / steps.length) % 2) % steps.length;
  return [steps[firstIndex], steps[secondIndex]];
}

export function evaluateChallengeStep(step, face, previous = {}) {
  if (!face) {
    return { passed: false, state: previous };
  }

  if (step === 'blink') {
    const left = eyeAspectRatio(face.mesh ?? [], eyeLandmarks.left);
    const right = eyeAspectRatio(face.mesh ?? [], eyeLandmarks.right);
    if (left === null || right === null) {
      return { passed: false, state: previous };
    }
    const ratio = (left + right) / 2;
    const seenOpen = previous.seenOpen || ratio > 0.22;
    return { passed: seenOpen && ratio < 0.17, state: { seenOpen } };
  }

  let yaw = face.rotation?.angle?.yaw ?? 0;
  if (Math.abs(yaw) <= Math.PI) {
    yaw = yaw * 180 / Math.PI;
  }
  return {
    passed: step === 'turn-left' ? yaw <= -18 : yaw >= 18,
    state: previous
  };
}
