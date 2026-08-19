# Privacidad, evidencia y retención

## Datos almacenados

- Sesiones remotas enlazadas mediante identificadores Moodle, sin copiar nombres ni correos.
- Eventos técnicos y alertas para revisión humana.
- Una captura JPEG de identidad por sesión; no se graba vídeo continuo.
- Metadatos de auditoría de cada visualización, descarga y eliminación.

## Protección

La captura se cifra con AES-256-GCM antes de escribirse en un bucket S3 compatible con cifrado del lado del servidor. El bucket debe ser privado y accesible únicamente por la identidad de la API. La clave `EVIDENCE_ENCRYPTION_KEY`, las credenciales S3 y `PANEL_SSO_SECRET` se administran fuera del código.

La API solo emite acceso por 60 segundos después de comprobar la cookie del panel, el curso autorizado y `local/proctoring:viewbiometricevidence`. Cada autorización y descarga genera una fila de auditoría.

## Retención

`EVIDENCE_RETENTION_DAYS` define la conservación desde la creación de cada objeto. Ejecute diariamente:

```bash
pnpm api:evidence:purge
```

La tarea elimina primero el objeto, registra `retention_delete` y luego marca el metadato como eliminado. La institución debe fijar el plazo y el procedimiento de excepciones antes del piloto.
