# Punto e — Control del dispositivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar señales de control en navegador normal y ofrecer Safe Exam Browser como mecanismo de bloqueo fuerte opcional por cuestionario.

**Architecture:** Todos los cuestionarios con proctoring pueden ejecutarse en navegador normal, que registra señales sin prometer control del sistema operativo. Moodle permite `browser`, `seb` o `either`; solo `seb` exige configuración nativa válida y restricciones fuertes.

**Tech Stack:** React, browser events, Safe Exam Browser, Moodle PHP, Fastify, MariaDB, Vitest y PHPUnit.

**Spec:** `docs/implementation-plans/shared-contracts.md`, `apps/web/lib/seb-events.js` y `apps/moodle/mod/quiz/accessrule/proctoring/rule.php`.

## Global Constraints

- SEB no es obligatorio globalmente.
- `browser` permite rendir con monitoreo y alertas.
- `seb` es obligatorio solo para el cuestionario que lo configure.
- `either` permite ambos modos sin degradar silenciosamente una política `seb`.
- El navegador normal no promete impedir cierres de pantalla, cambio de aplicaciones o apertura de archivos del sistema operativo.
- Las pruebas automáticas no dependen de certificados SSL externos.

## Archivos y responsabilidades

- Modificar: `apps/web/components/SessionMonitor.jsx`.
- Modificar: `apps/web/lib/seb-events.js`.
- Modificar: `packages/contracts/src/event.js` y `session.js`.
- Crear: `apps/web/lib/device-signals.js`.
- Modificar: `apps/moodle/mod/quiz/accessrule/proctoring/rule.php`.
- Modificar: `apps/moodle/mod/quiz/accessrule/proctoring/db/install.xml` y `db/upgrade.php` si corresponde.
- Modificar: `apps/moodle/mod/quiz/accessrule/proctoring/lang/en/quizaccess_proctoring.php`.
- Crear: `apps/api/src/db/migrations/014_device_policies.sql`.
- Pruebas: `apps/web/test/device-signals.test.js`, `apps/web/test/seb-events.test.js`, `apps/moodle/mod/quiz/accessrule/proctoring/tests/rule_test.php`.

## Política de modo

```json
{
  "deviceModePolicy": "browser|seb|either",
  "sebConfigId": "seb-config-v2|null",
  "sebConfigHash": "sha256|null",
  "minimumSebVersion": "3.7|null"
}
```

Reglas:

- `browser`: inicia en navegador normal; registra `visibilitychange`, `blur`, `focus`, pantalla completa, pérdida de cámara y red.
- `seb`: Moodle rechaza el intento si no hay configuración nativa válida o la versión SEB no es admitida.
- `either`: el lanzamiento acepta navegador normal o SEB y registra el modo real utilizado.

## Tareas

### Tarea 1: Registrar señales del navegador normal

- [ ] Escribir pruebas para visibilidad, blur/focus, pantalla completa, pérdida de cámara, offline/online y salida de página.
- [ ] Ejecutar `pnpm --filter @proctoring/web test -- device-signals.test.js` y verificar FAIL inicial.
- [ ] Implementar `createDeviceSignalMonitor({ emit })` con listeners desmontables.
- [ ] Incluir `source: "browser"` y duración cuando el evento tenga inicio y fin.
- [ ] Evitar duplicar eventos durante un mismo cambio de estado.

### Tarea 2: Configurar modos en Moodle

- [ ] Añadir formulario controlado con `browser`, `seb` y `either`.
- [ ] Guardar hash, versión mínima y referencia de configuración SEB.
- [ ] Mantener valores existentes al actualizar un cuestionario.
- [ ] Añadir capacidades para que el docente configure su cuestionario y el gestor defina límites institucionales.
- [ ] Validar que no se acepte JavaScript o código arbitrario como configuración.

### Tarea 3: Aplicar SEB solo cuando corresponda

- [ ] Validar en `prevent_access()` la política del cuestionario y la configuración nativa.
- [ ] Rechazar solo el modo `seb` mal configurado; no bloquear cuestionarios `browser` o `either` por no tener SEB.
- [ ] Validar identificador, hash y versión reportados por SEB.
- [ ] Emitir `seb_event` para cambios críticos sin cambiar calificación.
- [ ] Mantener visibles los eventos de navegador normal en el panel.

### Tarea 4: Probar y aceptar

- [ ] Ejecutar pruebas web y PHPUnit del plugin.
- [ ] Confirmar que un cuestionario `browser` inicia sin SEB.
- [ ] Confirmar que un cuestionario `either` inicia en navegador y registra el modo.
- [ ] Confirmar que un cuestionario `seb` mal configurado impide iniciar.
- [ ] Probar SEB Windows y macOS solo en cuestionarios que lo habiliten.
- [ ] Las pruebas automáticas usarán mocks; la aceptación HTTPS será manual con certificado confiable.
