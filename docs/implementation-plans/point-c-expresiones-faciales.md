# Punto c — Análisis de expresiones faciales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detectar patrones persistentes de expresiones faciales como señal técnica revisable, sin afirmar fraude, emoción fraudulenta ni estado psicológico.

**Architecture:** Human analiza localmente una muestra cada 10 segundos. El navegador envía solo una categoría agregada, confianza, ventana temporal y versión del modelo cuando el patrón supera 30 segundos de persistencia; la API crea una alerta solo si la política del cuestionario la habilita.

**Tech Stack:** Human, React, JavaScript, Fastify, Zod, MariaDB, S3/MinIO, Vitest y panel Next.js.

**Spec:** `docs/implementation-plans/shared-contracts.md` y `apps/web/lib/human.js`.

## Global Constraints

- Modelo local y versión explícita.
- Confianza mínima inicial `0.60`.
- Persistencia mínima inicial: 30 segundos.
- Las categorías visibles serán técnicas: `neutral`, `positive`, `negative`, `uncertain`.
- No se guardan logits ni descriptores emocionales crudos.
- La función permanece desactivada hasta validar sesgo y aprobación institucional.
- Las pruebas automáticas no dependen de certificados SSL externos.

## Archivos y responsabilidades

- Modificar: `apps/web/lib/human.js` para activar `face.emotion`.
- Crear: `apps/web/lib/emotion-analysis.js` para agregación y persistencia temporal.
- Modificar: `apps/web/components/SessionMonitor.jsx` para muestreo y estado.
- Modificar: `packages/contracts/src/event.js` y `alert.js`.
- Crear: `apps/api/src/services/emotion-signal-service.js`.
- Crear: `apps/api/src/db/migrations/013_emotion_signals.sql`.
- Modificar: `apps/api/src/routes/incidents.js` y `panel.js`.
- Pruebas: `apps/web/test/emotion-analysis.test.js`, `apps/api/test/emotion-signals.test.js`.

## Contrato de señal

```json
{
  "type": "emotion_pattern_detected",
  "metadata": {
    "category": "uncertain",
    "confidence": 0.72,
    "windowSeconds": 40,
    "modelVersion": "human-3.3.6",
    "policyVersion": "quiz-policy-2"
  },
  "capture": "data:image/jpeg;base64,..."
}
```

## Tareas

### Tarea 1: Agregar agregador temporal local

- [ ] Escribir pruebas para una muestra, confianza baja, persistencia de 30 segundos y cambio de categoría.
- [ ] Ejecutar `pnpm --filter @proctoring/web test -- emotion-analysis.test.js` y verificar FAIL inicial.
- [ ] Implementar `createEmotionPatternTracker({ confidenceThreshold, persistenceMs })`.
- [ ] Emitir señal solo cuando la misma categoría supere la ventana mínima.
- [ ] Limpiar la ventana al cambiar de sesión o detectar modelo no disponible.

### Tarea 2: Exponer la política de captura

- [ ] Validar que la política indique explícitamente si se permite evidencia para este tipo.
- [ ] Si no está permitido, registrar solo el evento agregado sin captura.
- [ ] Si está permitido y hay frame, usar la cola común de incidencias.
- [ ] Si no hay frame, indicar `captureStatus: "unavailable"`.

### Tarea 3: Persistir y mostrar la señal

- [ ] Crear `proctoring_emotion_signals` con `session_id`, `event_id`, `category`, `confidence`, `window_seconds`, `model_version` y `created_at`.
- [ ] Crear alerta con etiqueta `Patrón facial atípico`, nunca `Fraude`.
- [ ] Mostrar categoría, confianza, ventana, captura y estado de revisión en el panel.
- [ ] Aplicar permisos de curso existentes.

### Tarea 4: Probar y aceptar

- [ ] Ejecutar `pnpm api:test` y `pnpm --filter @proctoring/web test`.
- [ ] Confirmar que una lectura aislada no alerta.
- [ ] Confirmar que confianza menor a 0.60 no alerta.
- [ ] Confirmar que el modelo no disponible deja estado `unavailable` y no rompe la supervisión.
- [ ] Confirmar que Moodle, logs e IndexedDB no contienen emociones crudas.
- [ ] Obtener revisión institucional antes de activar el feature flag.
