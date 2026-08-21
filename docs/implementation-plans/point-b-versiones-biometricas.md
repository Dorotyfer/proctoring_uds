# Punto b — Múltiples perfiles biométricos y versiones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mantener una sola identidad biométrica activa por cuenta Moodle y conservar versiones históricas revocables para auditoría y reinscripción autorizada.

**Architecture:** `moodleUserId` identifica el perfil global. Cada enrolamiento crea una versión cifrada; las verificaciones consultan solo la versión activa. El panel permite revocar, pero solo un gestor con `local/proctoring:managepolicies` puede hacerlo.

**Tech Stack:** Node.js, Fastify, MariaDB, AES-256-GCM, Zod, React, Moodle PHP y PHPUnit.

**Spec:** `docs/implementation-plans/shared-contracts.md` y el flujo existente de `biometric-profile-service`.

## Global Constraints

- Una cuenta Moodle tiene como máximo una versión `active`.
- Las versiones anteriores permanecen cifradas y con estado `revoked`.
- La reinscripción nunca ocurre automáticamente.
- Moodle envía `moodleUserId`, nombre, CI, curso, cuestionario e intento, pero nunca el descriptor almacenado.
- Las pruebas automáticas no dependen de certificados SSL externos.

## Archivos y responsabilidades

- Crear: `apps/api/src/db/migrations/009_biometric_profile_versions.sql`.
- Modificar: `apps/api/src/services/biometric-profile-service.js`.
- Modificar: `apps/api/src/repositories/biometric-profile-repository.js`.
- Modificar: `apps/api/src/routes/panel.js` y `apps/api/src/routes/sessions.js`.
- Modificar: `apps/web/components/PanelSessionDetail.jsx` y `apps/web/lib/panel-api.js`.
- Modificar: `apps/moodle/local/proctoring/db/access.php` y `apps/moodle/local/proctoring/classes/`.
- Pruebas: `apps/api/test/biometric-profile-service.test.js`, `apps/api/test/biometric-profile-concurrency.test.js`, `apps/moodle/local/proctoring/tests/`.

## Modelo de datos

Crear `proctoring_biometric_profile_versions` con:

```text
id, profile_id, version, algorithm, descriptor_ciphertext,
descriptor_length, encryption_iv, encryption_tag, consent_version,
consented_at, enrolled_at, revoked_at, status, created_at
```

Añadir `active_version_id` a `proctoring_biometric_profiles` y `profile_version_id` a las comprobaciones. Usar índice único `(profile_id, version)` y una transacción con bloqueo de fila para evitar dos versiones activas.

## Tareas

### Tarea 1: Migrar el perfil actual a versión 1

- [ ] Escribir la prueba de migración que conserva el descriptor cifrado existente.
- [ ] Ejecutar `pnpm api:test -- migrations.test.js` y verificar el caso nuevo.
- [ ] Insertar versión 1 con estado `active` para cada perfil existente.
- [ ] Completar `active_version_id` dentro de la misma transacción.
- [ ] Verificar que no se descifra ni se imprime ningún descriptor durante la migración.

### Tarea 2: Implementar enrolamiento concurrente

- [ ] Mantener `withUserLock(moodleUserId, callback)` como frontera transaccional.
- [ ] Rechazar enrolamiento sin `biometricConsentAccepted === true`.
- [ ] Crear una versión nueva con `version = max(version) + 1` solo después de adquirir el bloqueo.
- [ ] Revocar la versión anterior y activar la nueva en una sola transacción.
- [ ] Registrar `enroll`, `verify` y `reset` en `proctoring_biometric_audit` sin descriptores.
- [ ] Probar dos activaciones simultáneas y confirmar un único perfil y una única versión activa.

### Tarea 3: Exponer estado y revocación autorizada

**Interfaces:**

- `GET /v1/sessions/:sessionId` devuelve `biometric.state` y `enrollmentVersion`.
- `POST /v1/panel/biometric-profiles/:moodleUserId/revoke` devuelve `{ profile: { state: "revoked" } }`.

- [ ] Validar que el token del gestor contenga `local/proctoring:managepolicies`.
- [ ] No devolver ciphertext, IV, tag ni descriptor en ningún endpoint.
- [ ] Mostrar en el panel `Registrada`, `Revocada` o `Sin registro` y el historial de versiones.
- [ ] Hacer que el siguiente intento solicite nuevo consentimiento después de la revocación.

### Tarea 4: Probar y aceptar

- [ ] Ejecutar `pnpm api:test` y las pruebas PHPUnit del plugin.
- [ ] Confirmar enrolamiento inicial único.
- [ ] Confirmar versión 2 tras una reinscripción autorizada.
- [ ] Confirmar que un docente sin permiso recibe 403.
- [ ] Confirmar que el descriptor nunca aparece en logs, respuestas, Moodle o IndexedDB.
- [ ] Ejecutar aceptación real con API local o HTTPS confiable; no desactivar TLS en producción.
