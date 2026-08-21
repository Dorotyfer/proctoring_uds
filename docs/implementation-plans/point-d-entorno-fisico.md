# Punto d — Análisis y mapeo del entorno físico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detectar personas adicionales y objetos configurados como no autorizados dentro del encuadre de la cámara, generando evidencia puntual y revisable.

**Architecture:** Human ejecuta detección local de objetos. Un tracker exige tres detecciones consecutivas antes de emitir `environment_intrusion`; la API guarda categoría, cantidad, confianza y posición normalizada, además de una captura JPEG cifrada.

**Tech Stack:** Human, React, JavaScript, Fastify, Zod, MariaDB, AES-256-GCM, S3/MinIO, Vitest y panel Next.js.

**Spec:** `docs/implementation-plans/shared-contracts.md` y `apps/web/lib/human.js`.

## Global Constraints

- No se graba vídeo continuo.
- La captura contiene solo el frame puntual de la incidencia.
- Detección mínima: persona adicional, teléfono, pantalla adicional y documento/objeto no autorizado.
- Se requieren tres detecciones consecutivas.
- Las posiciones se normalizan entre 0 y 1.
- Las pruebas automáticas no dependen de certificados SSL externos.

## Archivos y responsabilidades

- Modificar: `apps/web/lib/human.js` para activar `object`.
- Crear: `apps/web/lib/environment-analysis.js` para políticas y detecciones consecutivas.
- Modificar: `apps/web/components/SessionMonitor.jsx`.
- Modificar: `packages/contracts/src/event.js`, `incident.js` y `alert.js`.
- Crear: `apps/api/src/services/environment-signal-service.js`.
- Crear: `apps/api/src/db/migrations/012_environment_signals.sql`.
- Modificar: `apps/api/src/routes/incidents.js`, `panel.js` y repositorio correspondiente.
- Pruebas: `apps/web/test/environment-analysis.test.js`, `apps/api/test/environment-signals.test.js`.

## Contrato de señal

```json
{
  "type": "environment_intrusion",
  "metadata": {
    "objectType": "phone",
    "objectCount": 1,
    "confidence": 0.91,
    "box": { "x": 0.42, "y": 0.18, "width": 0.16, "height": 0.22 },
    "modelVersion": "human-3.3.6"
  },
  "capture": "data:image/jpeg;base64,..."
}
```

## Tareas

### Tarea 1: Activar detección y tracker

- [ ] Escribir pruebas de persona adicional, objeto permitido, objeto alertable y detección aislada.
- [ ] Ejecutar `pnpm --filter @proctoring/web test -- environment-analysis.test.js` y verificar FAIL inicial.
- [ ] Configurar `object.enabled: true` sin activar modelos de manos o cuerpo no requeridos.
- [ ] Implementar `createEnvironmentTracker({ allowedObjects, alertableObjects, consecutiveDetections })`.
- [ ] Emitir solo después de tres detecciones consecutivas del mismo tipo.
- [ ] Convertir cajas a coordenadas normalizadas y redondear a cuatro decimales.

### Tarea 2: Persistir incidencia y captura

- [ ] Crear `proctoring_environment_signals` con `session_id`, `event_id`, `object_type`, `object_count`, `confidence`, `box_json`, `model_version` y `created_at`.
- [ ] Reutilizar la cola persistente de incidencias.
- [ ] Asociar evidencia mediante `event_id` y objeto estable por evento.
- [ ] Registrar `captureStatus: "unavailable"` cuando no exista frame.

### Tarea 3: Mostrar y autorizar

- [ ] Mostrar objeto, cantidad, confianza, posición, captura y revisión en el panel.
- [ ] Filtrar por curso y respetar la autorización del docente.
- [ ] Evitar mostrar información de otras sesiones o cursos.

### Tarea 4: Probar y aceptar

- [ ] Ejecutar `pnpm api:test` y `pnpm --filter @proctoring/web test`.
- [ ] Confirmar alerta por persona adicional y teléfono configurado.
- [ ] Confirmar que una detección aislada no genera alerta.
- [ ] Simular modelo no cargado y verificar `unavailable` sin caída de la sesión.
- [ ] Confirmar evidencia recuperable desde panel autorizado.
