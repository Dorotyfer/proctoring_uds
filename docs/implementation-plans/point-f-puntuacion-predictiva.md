# Punto f — Análisis predictivo explicable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calcular en tiempo real un nivel de riesgo explicable a partir de señales acumuladas durante la sesión, sin bloquear ni calificar automáticamente.

**Architecture:** La API mantiene una ventana móvil de cinco minutos y recalcula una puntuación determinista de 0 a 100 al recibir eventos. El resultado incluye factores, pesos, versión de política y eventos relacionados para que el docente pueda revisarlo.

**Tech Stack:** JavaScript ESM, Fastify, MariaDB, JSON, React, Vitest y Node Test Runner.

**Spec:** `docs/implementation-plans/shared-contracts.md` y `apps/api/src/services/event-service.js`.

## Global Constraints

- Puntuación entre 0 y 100.
- Ventana móvil inicial de cinco minutos.
- Decaimiento temporal versionado.
- Factores siempre visibles y explicables.
- La puntuación nunca bloquea, suspende ni cambia la calificación.
- Las pruebas automáticas no dependen de certificados SSL externos.

## Pesos iniciales

| Señal | Peso |
|---|---:|
| `biometric_mismatch` | 40 |
| `biometric_monitor_mismatch` | 40 |
| `multiple_faces` | 30 |
| `camera_interrupted` | 25 |
| `environment_intrusion` | 20 |
| `emotion_pattern_detected` | 10 |
| `page_visibility_changed` | 10 |
| `network_disconnected` | 5 |
| `seb_event` crítico | 15 |

Niveles: `0–39 normal`, `40–69 observación`, `70–100 alerta alta`.

## Archivos y responsabilidades

- Crear: `apps/api/src/services/risk-score-service.js`.
- Crear: `apps/api/src/repositories/risk-score-repository.js`.
- Crear: `apps/api/src/db/migrations/015_risk_scores.sql`.
- Modificar: `apps/api/src/services/event-service.js` e `incident-service.js`.
- Modificar: `apps/api/src/routes/panel.js`.
- Modificar: `apps/web/components/PanelSessionDetail.jsx` y `apps/web/lib/panel-api.js`.
- Pruebas: `apps/api/test/risk-score-service.test.js`, `apps/api/test/risk-score-idempotency.test.js`, `apps/web/test/panel-risk-score.test.jsx`.

## Contrato de puntuación

```json
{
  "score": 72,
  "level": "high",
  "policyVersion": "risk-v1",
  "factors": [
    { "type": "multiple_faces", "weight": 30, "count": 1, "contribution": 30 },
    { "type": "camera_interrupted", "weight": 25, "count": 1, "contribution": 25 }
  ],
  "calculatedAt": "2026-08-21T12:00:00.000Z"
}
```

## Tareas

### Tarea 1: Implementar cálculo determinista

- [ ] Escribir pruebas con cero señales, una señal, señales repetidas, decaimiento y tope 100.
- [ ] Ejecutar `pnpm api:test -- risk-score-service.test.js` y verificar FAIL inicial.
- [ ] Implementar `calculateRiskScore(events, now, policy)` sin acceso a red ni base de datos.
- [ ] Aplicar decaimiento por edad y limitar cada contribución al peso configurado.
- [ ] Ordenar factores por contribución descendente para una respuesta estable.
- [ ] Devolver `score`, `level`, `factors` y `policyVersion`.

### Tarea 2: Persistir al recibir eventos

- [ ] Crear `proctoring_risk_scores` con `session_id`, `score`, `level`, `factors`, `policy_version` y `created_at`.
- [ ] Recalcular después de insertar un evento aceptado.
- [ ] Usar `event_id` o una huella de evento para evitar doble contribución en reintentos.
- [ ] Mantener el histórico de puntuaciones para la gráfica del panel.

### Tarea 3: Mostrar riesgo sin acción automática

- [ ] Añadir endpoint autorizado de consulta por sesión.
- [ ] Mostrar puntuación, nivel, evolución y factores.
- [ ] Enlazar cada factor con sus eventos y evidencias.
- [ ] No añadir ninguna ruta que modifique la calificación del quiz.

### Tarea 4: Probar y aceptar

- [ ] Ejecutar `pnpm api:test` y pruebas web del panel.
- [ ] Confirmar cálculo repetible con el mismo conjunto de eventos.
- [ ] Confirmar que reintentos no aumentan la puntuación dos veces.
- [ ] Confirmar que una puntuación alta solo aparece como alerta revisable.
- [ ] Realizar prueba manual con API disponible; las pruebas automatizadas usarán servidor local/mocks sin SSL externo.
