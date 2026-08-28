const severityByType = {
  camera_interrupted: 'high',
  face_absent: 'medium',
  face_out_of_frame: 'low',
  identity_check_failed: 'high',
  biometric_mismatch: 'high',
  liveness_check_failed: 'high',
  multiple_faces: 'high',
  network_disconnected: 'low',
  page_visibility_changed: 'low',
  seb_event: 'medium',
  biometric_monitor_mismatch: 'high',
  environment_intrusion: 'high',
  facial_pattern_detected: 'low',
  window_blur: 'low',
  fullscreen_exit: 'medium',
  page_unload: 'medium',
  device_mode_mismatch: 'high'
};

export function createAlertService(repository) {
  return {
    async classify(event) {
      const severity = severityByType[event.type];
      return severity ? repository.createForEvent(event, severity) : null;
    }
  };
}
