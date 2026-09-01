const ALERT_LABELS = {
  attention_signal: 'Observación de expresión facial',
  biometric_monitor_mismatch: 'Verificación biométrica continua no coincidente',
  biometric_mismatch: 'Identidad biométrica no coincidente',
  camera_interrupted: 'Cámara interrumpida',
  face_absent: 'Rostro ausente',
  face_out_of_frame: 'Rostro fuera de encuadre',
  facial_pattern_detected: 'Patrón facial técnico persistente',
  environment_intrusion: 'Intrusión en el entorno',
  fullscreen_exit: 'Salida de pantalla completa',
  identity_check_failed: 'Falló la verificación de identidad',
  liveness_check_failed: 'Falló la prueba de vida',
  multiple_faces: 'Se detectaron múltiples rostros',
  network_disconnected: 'Desconexión de red',
  network_reconnected: 'Conexión de red restablecida',
  page_visibility_changed: 'Cambio de visibilidad de la página',
  seb_event: 'Evento de Safe Exam Browser',
  window_blur: 'Ventana perdió el foco',
  page_unload: 'Salida de la página',
  device_mode_mismatch: 'Modo de dispositivo no permitido'
};

const DEVICE_MODE_LABELS = {
  browser: 'Navegador',
  seb: 'Safe Exam Browser'
};

const EXPRESSION_LABELS = {
  angry: 'Enojo',
  disgust: 'Desagrado',
  fear: 'Miedo',
  happy: 'Alegría',
  neutral: 'Neutral',
  sad: 'Tristeza',
  surprise: 'Sorpresa'
};

const SESSION_STATUS_LABELS = {
  active: 'Activo',
  completed: 'Completado',
  expired: 'Expirado',
  pending: 'Pendiente'
};

const SEVERITY_LABELS = {
  high: 'Alta',
  low: 'Baja',
  medium: 'Media'
};

const REVIEW_STATUS_LABELS = {
  dismissed: 'Inválida',
  open: 'Pendiente',
  reviewed: 'Válida'
};

export function alertTypeLabel(type) {
  return ALERT_LABELS[type] ?? 'Evento de supervisión';
}

export function deviceModeLabel(mode) {
  return DEVICE_MODE_LABELS[mode] ?? 'Modalidad no determinada';
}

export function expressionLabel(expression) {
  return EXPRESSION_LABELS[expression] ?? 'No determinada';
}

export function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('es-PY') : 'Fecha no informada';
}

export function reviewStatusLabel(status) {
  return REVIEW_STATUS_LABELS[status] ?? 'Pendiente';
}

export function sessionStatusLabel(status) {
  return SESSION_STATUS_LABELS[status] ?? 'Estado no determinado';
}

export function severityLabel(severity) {
  return SEVERITY_LABELS[severity] ?? 'No determinada';
}
