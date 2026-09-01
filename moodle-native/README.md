# Proctoring nativo para Moodle

Implementación nativa de Proctoring UDS para ejecutar el backend, el flujo del
estudiante, el monitoreo, las evidencias y el panel de revisión dentro de
Moodle, sin depender de la API Node.js externa.

## Estado

La rama `codex/moodle-only-migration` contiene el vertical slice nativo:

- `local/proctoring`: persistencia, servicios AJAX, cifrado, evidencias, panel,
  privacidad, tareas y módulos AMD.
- `mod/quiz/accessrule/proctoring`: regla de acceso, preparación y ciclo de
  vida del intento.
- `tests/js`: pruebas de JavaScript que pueden ejecutarse sin Moodle.

La validación PHPUnit/Behat debe ejecutarse en una instalación Moodle real. Este
workspace no incluye el core de Moodle, PHP ni `vendor/bin/phpunit`.

## Pruebas locales

```text
pnpm --dir moodle-native test -- --run
```

## Instalación

Consulta `docs/installation.md`. No subas la carpeta `moodle-native` completa:
se copian sus dos plugins en las rutas de Moodle indicadas allí.
