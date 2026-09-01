# Despliegue blue-green sin Docker

Cada release vive en `/opt/proctoring/releases/<commit>` y usa servicios systemd separados por color. Los secretos permanecen en `/etc/proctoring/*.env`, fuera del repositorio.

Antes del cambio: respaldar MariaDB y metadatos S3/MinIO, instalar con lockfile, ejecutar migraciones compatibles, pruebas, `/health`, `api:infra:check` y una sesión sintética Moodle completa. Cambiar el upstream únicamente después de confirmar API, web, evidencia y SSE.

Para rollback, restaurar el upstream anterior y reiniciar solo el servicio afectado. No eliminar el release anterior hasta completar la ventana de observación y validar restauración de backups.
