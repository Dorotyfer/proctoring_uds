import { describe, expect, it } from 'vitest';

import {
  alertTypeLabel,
  deviceModeLabel,
  expressionLabel,
  reviewStatusLabel,
  sessionStatusLabel,
  severityLabel
} from '@/lib/localization';

describe('localización de información de supervisión', () => {
  it('traduce tipos de alerta y eventos registrados', () => {
    expect(alertTypeLabel('camera_interrupted')).toBe('Cámara interrumpida');
    expect(alertTypeLabel('network_reconnected')).toBe('Conexión de red restablecida');
    expect(alertTypeLabel('attention_signal')).toBe('Observación de expresión facial');
    expect(alertTypeLabel('unknown_internal_code')).toBe('Evento de supervisión');
  });

  it('traduce severidad, estado, modalidad y revisión', () => {
    expect(severityLabel('high')).toBe('Alta');
    expect(severityLabel('medium')).toBe('Media');
    expect(severityLabel('low')).toBe('Baja');
    expect(sessionStatusLabel('active')).toBe('Activo');
    expect(sessionStatusLabel('completed')).toBe('Completado');
    expect(deviceModeLabel('browser')).toBe('Navegador');
    expect(deviceModeLabel('seb')).toBe('Safe Exam Browser');
    expect(reviewStatusLabel('dismissed')).toBe('Inválida');
  });

  it('traduce expresiones faciales conocidas sin mostrar códigos del modelo', () => {
    expect(expressionLabel('neutral')).toBe('Neutral');
    expect(expressionLabel('happy')).toBe('Alegría');
    expect(expressionLabel('unknown_expression')).toBe('No determinada');
  });
});
