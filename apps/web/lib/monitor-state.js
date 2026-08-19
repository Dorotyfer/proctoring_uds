const thresholds = {
  absent: 3,
  multiple: 2,
  'out-of-frame': 3
};

const eventTypes = {
  absent: 'face_absent',
  multiple: 'multiple_faces',
  'out-of-frame': 'face_out_of_frame'
};

export function createFaceStateTracker() {
  let count = 0;
  let current = 'valid';
  let emitted = false;

  return {
    update(next) {
      if (next !== current) {
        current = next;
        count = 0;
        emitted = false;
      }
      if (next === 'valid') {
        return null;
      }

      count += 1;
      if (!emitted && count >= thresholds[next]) {
        emitted = true;
        return eventTypes[next];
      }
      return null;
    }
  };
}
