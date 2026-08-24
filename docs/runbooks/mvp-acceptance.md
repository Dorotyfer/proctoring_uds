# Aceptación del MVP

## Gates funcionales

- Moodle crea la sesión y solo acepta URLs de retorno del origen canónico.
- La preparación exige consentimiento, cámara y desafío de tres capturas reales.
- El servidor procesa identidad y prueba de vida; el navegador solo captura y presenta estados.
- El monitoreo respeta intervalos, `Retry-After` y conserva como máximo el JPEG pendiente más reciente en memoria.
- Los eventos offline son JSON técnico acotado e idempotente; no incluyen imágenes, tokens ni descriptores.
- El panel aplica aislamiento por curso, CSRF en mutaciones, revisión, notas, evidencia, reset biométrico y cierre de sesión.
- La evidencia está cifrada, auditada y sujeta a retención.

## Gates de modelos

YuNet, SFace, FasNet y SSDLite deben estar aprovisionados con hashes institucionales verificados antes del release. No se aceptan valores de ejemplo. La aceptación mide precisión y latencia con el hardware y dataset aprobados; este documento no declara resultados no ejecutados.

## Ejecución final

```bash
source .venv/bin/activate
python -m pytest
```

Después se ejecutan las suites Selenium con cámara falsa y las pruebas Moodle/PHP descritas por CI. Los resultados, versiones de modelos y evidencia de SLA se adjuntan al acta de release.
