# Punto g — Conductas configurables por la institución Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que la institución configure conductas consideradas anómalas o fraudulentas mediante reglas declarativas, versionadas y limitadas a una lista cerrada.

**Architecture:** Moodle guarda la configuración controlada del cuestionario y la API recibe una copia inmutable al crear la sesión. El navegador solo puede emitir señales conocidas; la API valida límites, permisos y alcance institucional antes de aplicar una regla.

**Tech Stack:** Moodle PHP, Fastify, Zod, MariaDB, React, PHPUnit, Vitest y JSON.

**Spec:** `docs/implementation-plans/shared-contracts.md` y `apps/moodle/mod/quiz/accessrule/proctoring/rule.php`.

## Global Constraints

- No se ejecutará JavaScript, SQL ni expresiones arbitrarias provenientes de Moodle.
- Solo se aceptan tipos de evento de una lista cerrada.
- La política se copia a la sesión y no cambia durante el intento.
- El docente solo configura cuestionarios de sus cursos.
- El gestor con `local/proctoring:managepolicies` define límites institucionales.
- Las pruebas automáticas no dependen de certificados SSL externos.

## Archivos y responsabilidades

- Crear: `apps/api/src/services/policy-service.js`.
- Crear: `apps/api/src/repositories/policy-repository.js`.
- Crear: `apps/api/src/db/migrations/011_proctoring_policies.sql`.
- Modificar: `apps/api/src/routes/sessions.js` y `incidents.js`.
- Modificar: `packages/contracts/src/session.js`.
- Modificar: `apps/moodle/mod/quiz/accessrule/proctoring/rule.php`.
- Modificar: `apps/moodle/mod/quiz/accessrule/proctoring/db/install.xml` y `db/upgrade.php`.
- Modificar: `apps/moodle/local/proctoring/classes/session_manager.php`.
- Pruebas: `apps/api/test/policy-service.test.js`, `apps/api/test/policy-authorization.test.js`, `apps/moodle/mod/quiz/accessrule/proctoring/tests/rule_test.php`.

## Contrato de política

```json
{
  "policyVersion": "quiz-policy-3",
  "signals": [
    {
      "type": "multiple_faces",
      "count": 2,
      "windowSeconds": 30,
      "severity": "high",
      "capture": true,
      "studentMessage": "Se detectaron varios rostros."
    }
  ]
}
```

Límites iniciales: `count` entre 1 y 10, `windowSeconds` entre 5 y 900, severidad `low|medium|high`, mensaje de máximo 240 caracteres y hasta 20 reglas por cuestionario.

## Tareas

### Tarea 1: Validar esquema cerrado

- [ ] Escribir pruebas para política válida, tipo desconocido, umbral fuera de rango, regla duplicada y código arbitrario.
- [ ] Ejecutar `pnpm api:test -- policy-service.test.js` y verificar FAIL inicial.
- [ ] Implementar `validatePolicy(policy)` con Zod y lista cerrada de señales.
- [ ] Normalizar el orden de señales para obtener una versión determinista.
- [ ] Rechazar campos desconocidos que intenten introducir código ejecutable.

### Tarea 2: Guardar y copiar la política

- [ ] Crear `proctoring_quiz_policies` con curso, quiz, versión, JSON validado, actor y fechas.
- [ ] Crear una copia inmutable en la sesión al ejecutar `create_for_attempt()`.
- [ ] Rechazar cambios de política para una sesión ya activa.
- [ ] Guardar `policyVersion` en cada evento emitido.

### Tarea 3: Integrar permisos Moodle/API

- [ ] Añadir formulario controlado para señal, cantidad, ventana, severidad, captura y mensaje.
- [ ] Validar curso y cuestionario antes de guardar.
- [ ] Permitir editar al docente del curso y limitar el techo institucional al gestor autorizado.
- [ ] Devolver 403 para actores fuera del curso o sin capacidad.
- [ ] Mostrar al alumno solo el texto visible configurado, sin detalles internos sensibles.

### Tarea 4: Probar y aceptar

- [ ] Ejecutar pruebas API y PHPUnit.
- [ ] Confirmar aislamiento entre dos cursos.
- [ ] Confirmar que una política no cambia después de iniciar el intento.
- [ ] Confirmar que una regla con `capture: true` activa el pipeline de evidencia.
- [ ] Confirmar que no se ejecuta ningún texto de configuración como código.
