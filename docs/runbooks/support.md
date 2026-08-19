# Soporte operativo

## Clasificación

- P1: acceso cruzado, evidencia pública, pérdida de auditoría o exposición de secretos.
- P2: estudiantes bloqueados de forma general, API o almacenamiento indisponible.
- P3: falla de cámara/dispositivo individual, alerta retrasada o problema visual.

## Diagnóstico inicial

1. Solicite hora, intento Moodle, dispositivo, navegador y `X-Correlation-ID`; no solicite imágenes por correo.
2. Consulte `/health` y los registros estructurados de API por correlación.
3. Compruebe conectividad PostgreSQL y S3 desde la identidad del servicio.
4. Confirme la configuración del cuestionario, su modalidad y la regla nativa SEB.
5. Revise el estado remoto sin modificar el intento ni la calificación.

## Acciones permitidas

- Reintentar preparación o reapertura del panel mediante un token SSO nuevo.
- Recuperar eventos pendientes al restablecer la red.
- Marcar una alerta revisada o descartada con nota.
- Elevar una excepción de retención mediante el procedimiento institucional.

Nunca cambie una calificación a partir de una alerta, comparta URLs temporales ni copie secretos a tickets.
