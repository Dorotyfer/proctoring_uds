# Arquitectura activa

## Fronteras

Moodle es el origen de intentos, cursos y permisos. Los plugins PHP emiten tokens de vida corta y consumen la API por TLS. FastAPI expone la API y las páginas Jinja2 bajo `/proctoring`; MariaDB persiste sesiones, revisiones, perfiles y eventos, y un almacén S3 compatible conserva evidencia cifrada. El worker Python procesa análisis y retención.

El navegador ejecuta únicamente módulos ES nativos. Solicita consentimiento y cámara, captura JPEG, presenta indicaciones y encola JSON técnico limitado. No ejecuta inferencia, no conserva tokens ni imágenes en almacenamiento web y no emite conclusiones biométricas o de incidencia.

## Flujo de análisis

1. FastAPI valida el token y la URL de retorno contra el origen Moodle canónico.
2. El navegador solicita un desafío y envía tres capturas para preparación, o capturas espaciadas para monitoreo.
3. El servidor aplica YuNet para detección facial, SFace para identidad, FasNet para prueba de vida y SSDLite para personas y objetos permitidos por la política.
4. Las observaciones se confirman en servidor; una muestra aislada no se transforma en alerta concluyente.
5. Operadores autorizados revisan alertas y evidencia desde el panel con CSRF y aislamiento por curso.

No existe análisis de emociones. No existe inferencia biométrica en navegador.

## Seguridad y privacidad

- CSP sin `unsafe-inline` ni `unsafe-eval`, `frame-ancestors` restringido y política de permisos solo para cámara.
- URLs de retorno comparadas con el origen Moodle exacto.
- perfiles SFace versionados y cifrados; una sola versión activa por usuario;
- evidencia cifrada, acceso auditado, retención configurada y borrado por worker;
- IndexedDB limitado a eventos JSON de red, visibilidad, cámara y SEB; nunca imágenes, base64, descriptores ni tokens;
- rollback de aplicación por Git; migraciones SQL aditivas y compatibles hacia atrás.

## Despliegue

Apache termina TLS y publica `/proctoring`. systemd ejecuta `proctoring-api` y `proctoring-worker` en un entorno virtual Python dedicado. No se necesita un runtime web adicional ni un paso de compilación del frontend.
