# Punto a — Validación biométrica continua Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Comparar periódicamente nuevas muestras faciales con el perfil biométrico activo durante todo el intento, sin interrumpir automáticamente el examen.

**Architecture:** Human genera descriptores en el navegador; el navegador envía solo tres muestras por verificación mediante HTTPS. La API descifra el perfil activo, calcula similitud y, si las tres muestras fallan, crea una alerta alta con captura cifrada.

**Tech Stack:** Human, React, IndexedDB, Fastify, Zod, MariaDB, AES-256-GCM, S3/MinIO, Vitest y Node Test Runner.

**Spec:** `docs/implementation-plans/shared-contracts.md`, `apps/api/src/services/biometric-profile-service.js` y `apps/web/lib/face-analysis.js`.

## Global Constraints

- Intervalo inicial: 30 segundos, configurable entre 15 y 120 segundos.
- Cada verificación requiere exactamente tres descriptores Human de longitud 1024.
- Se genera `biometric_monitor_mismatch` solo cuando las tres muestras quedan debajo del umbral.
- Umbral inicial `BIOMETRIC_MATCH_THRESHOLD=0.50`.
- No guardar descriptores en IndexedDB, logs, Moodle o respuestas.
- Una indisponibilidad temporal no activa silenciosamente una verificación aprobada.
- Las pruebas automáticas no dependen de certificados SSL externos.

## Archivos y responsabilidades

- Crear: `apps/web/lib/biometric-monitor.js`, coordinador de intervalo y muestras.
- Modificar: `apps/web/lib/face-analysis.js`, extracción de embedding.
- Modificar: `apps/web/components/SessionMonitor.jsx`, ciclo de vida y estado visible.
- Modificar: `apps/web/lib/session-api.js`, endpoint de verificación.
- Modificar: `packages/contracts/src/event.js` e `incident.js`, tipos y payload.
- Crear: `apps/api/src/services/biometric-monitor-service.js`, comparación y resultado.
- Crear: `apps/api/src/repositories/biometric-monitor-repository.js`.
- Crear: `apps/api/src/db/migrations/010_biometric_monitor_checks.sql`.
- Modificar: `apps/api/src/routes/sessions.js`.
- Pruebas: `apps/api/test/biometric-monitor.test.js`, `apps/web/test/biometric-monitor.test.js`.

## Contrato

`POST /v1/sessions/:sessionId/biometric-checks` recibe:

```json
{
  "clientCheckId": "uuid",
  "occurredAt": "2026-08-21T12:00:00.000Z",
  "samples": [[0.1, 0.2]],
  "capture": "data:image/jpeg;base64,..."
}
```

Responde con:

```json
{
  "check": {
    "id": "uuid",
    "status": "matched|mismatch|unavailable|invalid",
    "similarity": 0.82,
    "threshold": 0.5,
    "alertId": "uuid|null"
  }
}
```

La respuesta no contiene el descriptor almacenado ni las muestras recibidas.

## Tareas

### Tarea 1: Capturar muestras sin persistir descriptores

**Interfaces:**

- `createBiometricMonitor({ detector, getVideo, intervalMs, onResult })` inicia y detiene el intervalo.
- `extractFaceEmbedding(face)` devuelve una copia válida de 1024 números o `null`.

- [ ] Escribir pruebas de tres embeddings válidos, rostro ausente y descriptor inválido.
- [ ] Ejecutar `pnpm --filter @proctoring/web test -- biometric-monitor.test.js` y verificar que inicialmente fallen los casos nuevos.
- [ ] Implementar el muestreo sin incluir los arrays en logs, cola ni mensajes de UI.
- [ ] Tomar la captura JPEG del mismo frame cuando la verificación final sea `mismatch`.
- [ ] Verificar que desmontar `SessionMonitor` detiene el intervalo.

### Tarea 2: Crear migración y servicio API

**Tabla `proctoring_biometric_monitor_checks`:**

```text
id, session_id, client_check_id, profile_version_id, sample_count,
similarity, threshold, result, alert_event_id, created_at
```

- [ ] Agregar índice único `(session_id, client_check_id)` y claves foráneas a sesión, perfil y evento.
- [ ] Implementar `recordCheck(sessionId, input)` dentro del servicio.
- [ ] Rechazar cantidad distinta de tres, longitud distinta de 1024 y valores no finitos.
- [ ] Consultar solo la versión biométrica activa.
- [ ] Comparar cada muestra y usar la mínima similitud para el resultado final.
- [ ] Crear una alerta de severidad `high` solo con tres muestras no coincidentes.
- [ ] Mantener idempotencia por `clientCheckId`.

### Tarea 3: Integrar captura y cola de incidencias

- [ ] Enviar la captura únicamente cuando el resultado sea `mismatch` y exista frame disponible.
- [ ] Reutilizar `createIncident`, `createIncidentBuffer` y `deliverIncident`.
- [ ] Si no hay frame, persistir `biometric_monitor_mismatch` con metadata `captureStatus: "unavailable"`.
- [ ] Mostrar `Verificación biométrica activa`, `Pendiente` o `No disponible`.
- [ ] Reintentar ante red caída sin descartar la verificación mientras la página siga activa.

### Tarea 4: Probar y aceptar

- [ ] Ejecutar `pnpm api:test` y `pnpm --filter @proctoring/web test`.
- [ ] Confirmar que un alumno coincidente no crea alerta.
- [ ] Confirmar que tres muestras no coincidentes crean una sola alerta y evidencia.
- [ ] Repetir el mismo `clientCheckId` y confirmar que no duplica filas.
- [ ] Simular perfil revocado y verificar estado `unavailable` o `invalid` sin aprobación silenciosa.
- [ ] Realizar aceptación manual en navegador con certificado confiable; las pruebas automáticas usarán mocks locales.
