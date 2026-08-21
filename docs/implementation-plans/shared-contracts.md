# Contratos y plataforma común Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Definir el contrato común que deben usar los ocho módulos para eventos, alertas, capturas, políticas, revisión y seguridad.

**Architecture:** El navegador produce eventos o incidencias idempotentes. La API valida y persiste el evento, crea la alerta, cifra la captura y guarda sus metadatos en MariaDB; el panel consulta el resultado mediante acceso autorizado.

**Tech Stack:** JavaScript ESM, Fastify, Zod, MariaDB, S3/MinIO, Next.js, React, Vitest, Node Test Runner y PHPUnit para Moodle.

**Spec:** `docs/implementation-plans/README.md` y `docs/architecture.md`.

## Global Constraints

- Eventos idempotentes por `sessionId + clientEventId`.
- Capturas JPEG de máximo 200 KB, cifradas antes de S3/MinIO.
- Ningún descriptor biométrico, emoción o dato sensible en IndexedDB, logs o Moodle.
- Las señales no bloquean ni califican automáticamente el examen.
- SEB es opcional y se exige solo cuando la política del cuestionario usa `seb`.
- Las pruebas automáticas no dependen de certificados SSL externos; las pruebas HTTPS reales son manuales.

## Contratos

### Evento sin captura

```json
{
  "clientEventId": "uuid",
  "type": "network_disconnected",
  "occurredAt": "2026-08-21T12:00:00.000Z",
  "metadata": {
    "source": "browser",
    "policyVersion": "quiz-policy-1"
  }
}
```

### Incidencia con captura opcional

```json
{
  "clientEventId": "uuid",
  "type": "environment_intrusion",
  "occurredAt": "2026-08-21T12:00:00.000Z",
  "metadata": {
    "source": "browser",
    "modelVersion": "human-3.3.6",
    "confidence": 0.91,
    "factors": ["phone"]
  },
  "capture": "data:image/jpeg;base64,..."
}
```

La respuesta de `POST /v1/sessions/:sessionId/incidents` será:

```json
{
  "incident": {
    "eventId": "uuid",
    "alertId": "uuid",
    "evidenceId": "uuid|null",
    "status": "open"
  }
}
```

### Tipos de evento

Los contratos de `packages/contracts/src/event.js` y `packages/contracts/src/alert.js` deben mantener una lista cerrada que incluya como mínimo:

```text
camera_interrupted
face_absent
multiple_faces
face_out_of_frame
identity_check_failed
biometric_mismatch
biometric_monitor_mismatch
liveness_check_failed
page_visibility_changed
network_disconnected
network_reconnected
seb_event
emotion_pattern_detected
environment_intrusion
predictive_risk_high
```

Los tipos nuevos deben tener severidad explícita y etiqueta visible en el panel.

## Tareas

### Tarea 1: Congelar contratos y validadores

**Archivos:**

- Modificar: `packages/contracts/src/event.js`.
- Modificar: `packages/contracts/src/incident.js`.
- Modificar: `packages/contracts/src/alert.js`.
- Modificar: `packages/contracts/src/index.js`.
- Prueba: `packages/contracts/test/contracts.test.js`.

**Interfaces:**

- Produce `EventType`, `IncidentInput` y los tipos exportados para API y web.
- `IncidentInput` rechaza capturas que no sean `data:image/jpeg;base64,...` y metadatos mayores de 8 KB.

- [ ] Añadir cada tipo nuevo a los enums cerrados.
- [ ] Añadir pruebas de aceptación y rechazo para cada tipo.
- [ ] Ejecutar `pnpm --filter @proctoring/contracts test` y verificar PASS.

### Tarea 2: Hacer idempotente el pipeline de API

**Archivos:**

- Modificar: `apps/api/src/services/incident-service.js`.
- Modificar: `apps/api/src/services/event-service.js`.
- Modificar: `apps/api/src/repositories/event-repository.js`.
- Modificar: `apps/api/src/repositories/evidence-repository.js`.
- Modificar: `apps/api/src/routes/incidents.js`.
- Pruebas: `apps/api/test/incidents.test.js`, `apps/api/test/events.test.js`.

**Interfaces:**

- `incidentService.record(sessionId, input)` devuelve `event`, `alert` y `evidence`.
- Una repetición del mismo `clientEventId` devuelve los mismos IDs sin insertar filas nuevas.

- [ ] Validar UUID, fecha, tipo, metadatos y captura antes de tocar la base de datos.
- [ ] Buscar el evento existente antes de crear alerta o evidencia.
- [ ] Usar `event_id` como clave estable del objeto cifrado.
- [ ] Probar dos envíos idénticos y verificar una sola fila por evento, alerta y evidencia.
- [ ] Ejecutar `pnpm api:test` con el servicio de almacenamiento simulado.

### Tarea 3: Mantener la cola persistente del navegador

**Archivos:**

- Modificar: `apps/web/lib/incident-buffer.js`.
- Modificar: `apps/web/lib/incident-delivery.js`.
- Modificar: `apps/web/lib/incident-payload.js`.
- Modificar: `apps/web/lib/session-api.js`.
- Modificar: `apps/web/components/SessionMonitor.jsx`.
- Pruebas: `apps/web/test/incident-buffer.test.js`, `apps/web/test/incident-delivery.test.js`.

- [ ] Persistir la incidencia antes de intentar enviarla.
- [ ] Eliminarla solo tras respuesta HTTP exitosa y confirmación de `evidenceId` cuando haya captura.
- [ ] Mostrar pendientes, fallidas y sin frame disponible.
- [ ] Reintentar con backoff sin registrar el descriptor biométrico en la cola.
- [ ] Ejecutar `pnpm --filter @proctoring/web test`.

### Tarea 4: Aplicar seguridad y revisión

**Archivos:**

- Modificar: `apps/api/src/routes/panel.js`.
- Modificar: `apps/api/src/services/panel-auth-service.js`.
- Modificar: `apps/web/components/PanelSessionDetail.jsx`.
- Modificar: `apps/web/lib/panel-api.js`.
- Pruebas: `apps/api/test/panel-authorization.test.js`, `apps/web/test/panel-dashboard.test.jsx`.

- [ ] Comprobar que el docente solo ve sesiones de sus cursos.
- [ ] Servir la imagen mediante endpoint autorizado y token de corta duración.
- [ ] Mostrar `Válida` para `reviewed` e `Inválida` para `dismissed`.
- [ ] Guardar nota, revisor, fecha y auditoría.
- [ ] No exponer URL pública de S3/MinIO.

### Tarea 5: Verificación sin dependencia de SSL externo

**Archivos:**

- Modificar: `apps/api/test/` y `apps/web/test/` solo cuando el módulo agregue casos.
- Consultar: `apps/api/src/ops/check-infrastructure.js`.

- [ ] Usar `http://127.0.0.1` o mocks para pruebas automáticas.
- [ ] No desactivar verificación TLS en código de producción.
- [ ] Ejecutar la prueba real solo desde un navegador con el certificado confiable del servidor.
- [ ] Registrar manualmente API, MariaDB y S3/MinIO disponibles antes de la aceptación.

## Aceptación común

- Un evento sin captura se persiste y aparece en el panel.
- Una incidencia con captura crea una fila de evento, alerta y evidencia relacionada por `event_id`.
- Un reintento no duplica datos.
- La captura solo se abre con autorización válida.
- Una caída temporal de red, API, MariaDB o S3/MinIO deja el elemento pendiente y permite reintentar.
