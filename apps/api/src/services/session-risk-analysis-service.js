const SIGNALS = {
  biometric_mismatch: { label: 'Identidad biométrica no coincidente', points: 35, cap: 35 },
  multiple_faces: { label: 'Se detectaron múltiples rostros', points: 30, cap: 30 },
  liveness_check_failed: { label: 'Falló la prueba de vida', points: 30, cap: 30 },
  identity_check_failed: { label: 'Falló la validación de identidad', points: 30, cap: 30 },
  camera_interrupted: { label: 'Cámara interrumpida', points: 20, cap: 20 },
  face_absent: { label: 'Rostro ausente', points: 10, cap: 20 },
  face_out_of_frame: { label: 'Rostro fuera de encuadre', points: 8, cap: 16 },
  page_visibility_changed: { label: 'Cambio de visibilidad de la página', points: 8, cap: 16 },
  network_disconnected: { label: 'Desconexión de red', points: 5, cap: 10 },
  seb_event: { label: 'Evento sospechoso de Safe Exam Browser', points: 15, cap: 15 }
};

export function analyzeSessionRisk({ controlLevel = 'medium', events = [], alerts = [] }) {
  const counts = {};
  const reasonCounts = new Map();

  for (const item of [...events, ...alerts]) {
    const type = item?.type;
    const signal = SIGNALS[type];
    if (!signal || (type === 'seb_event' && item.metadata?.suspicious !== true)) {
      continue;
    }
    counts[type] = (counts[type] ?? 0) + 1;
    reasonCounts.set(type, (reasonCounts.get(type) ?? 0) + 1);
  }

  const reasons = [...reasonCounts.entries()]
    .map(([code, count]) => {
      const signal = SIGNALS[code];
      return {
        code,
        count,
        label: signal.label,
        points: Math.min(count * signal.points, signal.cap)
      };
    })
    .filter((reason) => reason.points > 0)
    .sort((left, right) => right.points - left.points || left.code.localeCompare(right.code));
  const score = Math.min(reasons.reduce((total, reason) => total + reason.points, 0), 100);

  return {
    category: categoryForScore(score),
    controlLevel: ['low', 'medium', 'high'].includes(controlLevel) ? controlLevel : 'medium',
    counts,
    reasons,
    score
  };
}

function categoryForScore(score) {
  if (score >= 70) return 'high_risk';
  if (score >= 40) return 'medium_risk';
  if (score >= 20) return 'observation';
  return 'normal';
}
