# Punto h — Registro de evidencia de movimientos anómalos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantizar que cada señal relevante produzca una captura JPEG cifrada, reintentable y directamente vinculada con el evento y la alerta.

**Architecture:** El navegador captura el último frame disponible y lo coloca en IndexedDB antes del envío. La API crea o recupera el evento idempotente, cifra la imagen con AES-256-GCM, la sube a S3/MinIO usando una clave estable y guarda metadatos en MariaDB.

**Tech Stack:** React, IndexedDB, Fastify, Zod, MariaDB, AES-256-GCM, S3/MinIO, Vitest y Node Test Runner.

**Spec:** `docs/implementation-plans/shared-contracts.md`, `apps/api/src/services/incident-service.js`, `apps/api/src/services/evidence-service.js` y `apps/web/lib/incident-buffer.js`.

## Global Constraints

- Captura JPEG máxima de 200 KB.
- Objeto cifrado antes de S3/MinIO.
- La clave estable será `${sessionId}/alert/${eventId}.enc`.
- La cola solo elimina un elemento tras confirmación exitosa del servidor.
- Si no existe frame, se conserva la alerta con estado `unavailable`.
- No se expone directamente el bucket.
- Las pruebas automáticas no dependen de certificados SSL externos.

## Estados

| Estado | Significado |
|---|---|
| `available` | Evidencia cifrada almacenada y recuperable |
| `pending` | Evento/alerta creada, evidencia aún en cola |
| `unavailable` | No existía frame al ocurrir la alerta |
| `failed` | Error persistente mostrado al usuario y pendiente de intervención |

## Archivos y responsabilidades

- Modificar: `apps/web/lib/incident-buffer.js`.
- Modificar: `apps/web/lib/incident-delivery.js`.
- Modificar: `apps/web/lib/incident-payload.js`.
- Modificar: `apps/web/components/SessionMonitor.jsx`.
- Modificar: `apps/api/src/services/incident-service.js`.
- Modificar: `apps/api/src/services/evidence-service.js`.
- Modificar: `apps/api/src/services/image-validation.js`.
- Modificar: `apps/api/src/repositories/evidence-repository.js` y `event-repository.js`.
- Crear: `apps/api/src/db/migrations/008_evidence_pipeline_hardening.sql`.
- Modificar: `apps/api/src/routes/incidents.js` y `panel.js`.
- Pruebas: `apps/api/test/incidents.test.js`, `apps/api/test/evidence-service.test.js`, `apps/api/test/resilient-object-storage.test.js`, `apps/web/test/incident-buffer.test.js`, `apps/web/test/incident-delivery.test.js`.

## Contrato de persistencia

Para cada incidencia con captura deben existir:

```text
proctoring_events.id = event_id
proctoring_alerts.event_id = event_id
proctoring_evidence.event_id = event_id
proctoring_evidence.object_key = `${sessionId}/alert/${eventId}.enc`
```

La respuesta debe incluir:

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

## Tareas

### Tarea 1: Validar y normalizar JPEG

- [ ] Escribir pruebas para JPEG válido, MIME incorrecto, base64 corrupto y tamaño mayor a 200 KB.
- [ ] Ejecutar `pnpm api:test -- image-validation.test.js` y verificar FAIL inicial para casos nuevos.
- [ ] Implementar validación de bytes, MIME real y límite de tamaño antes de cifrar.
- [ ] Rechazar PNG, SVG, HTML y payloads con cabeceras falsas.
- [ ] Mantener el error como reintentable solo cuando el problema sea red/almacenamiento; una captura inválida no debe reintentarse indefinidamente.

### Tarea 2: Persistir evento, alerta y evidencia de forma idempotente

- [ ] Crear migración con `event_id` nullable para mantener capturas antiguas.
- [ ] Añadir foreign key a `proctoring_events(id)` e índice único para una evidencia de alerta por evento.
- [ ] En `incidentService.record()`, recuperar el evento existente antes de crear alerta/evidencia.
- [ ] Crear la alerta aunque la captura no exista, usando estado `unavailable`.
- [ ] Cifrar antes de `objectStorage.put()` y limpiar el objeto si falla el insert de MariaDB.
- [ ] Confirmar que el reintento de S3 o MariaDB no cree un segundo objeto.

### Tarea 3: Hacer persistente la cola web

- [ ] Guardar la incidencia en IndexedDB antes de llamar a la API.
- [ ] Conservar captura, `clientEventId`, tipo, fecha y estado de entrega; nunca guardar descriptores.
- [ ] Aplicar reintentos con backoff para red y servidor.
- [ ] Eliminar solo con respuesta 2xx y `incident.eventId` válido.
- [ ] Mostrar cantidad pendiente, último error y `Sin imagen disponible` cuando corresponda.

### Tarea 4: Entregar y revisar desde el panel

- [ ] Añadir `evidenceId` y `captureStatus` a cada alerta del panel.
- [ ] Crear endpoint de contenido con token de corta duración y autorización por curso.
- [ ] Mostrar imagen, estado, nota, revisor y fecha de revisión.
- [ ] Mostrar `reviewed` como `Válida` y `dismissed` como `Inválida` sin cambiar los estados internos.
- [ ] Mantener visibles capturas históricas sin `event_id` como respaldo.

### Tarea 5: Probar y aceptar

- [ ] Ejecutar `pnpm api:test` y `pnpm --filter @proctoring/web test`.
- [ ] Confirmar fila de evento, alerta y evidencia en MariaDB.
- [ ] Confirmar objeto cifrado en S3/MinIO.
- [ ] Abrir la captura desde el panel autorizado.
- [ ] Simular red, S3 y MariaDB caídos y verificar estado pendiente sin pérdida.
- [ ] Repetir el mismo envío y confirmar cero duplicados.
- [ ] Ejecutar aceptación HTTPS manual con certificado confiable; ningún test automático debe desactivar la verificación TLS.
