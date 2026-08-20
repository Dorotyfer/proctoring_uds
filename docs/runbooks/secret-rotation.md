# Rotación de secretos

## Inventario

- `MOODLE_INTEGRATION_KEY`: Moodle y API.
- `PANEL_SSO_SECRET`: Moodle y API.
- `JWT_SECRET`: solo API; invalida tokens de navegador y panel.
- `EVIDENCE_ENCRYPTION_KEY`: solo API; necesaria para leer evidencia vigente.
- Credenciales S3 y `DATABASE_URL` de MariaDB/MySQL: solo servicio independiente.

## Procedimiento

1. Registre ventana, responsable y rollback en el gestor de cambios.
2. Cree el secreto nuevo en el almacén seguro; nunca en Git ni Moodle visible al navegador.
3. Para claves compartidas, actualice primero el componente receptor y después el emisor durante una ventana sin exámenes activos.
4. Reinicie únicamente los servicios que consumen el secreto y verifique `/health`.
5. Ejecute una sesión sintética, acceso SSO y lectura auditada de evidencia.
6. Revoque la versión anterior y registre la fecha.

La rotación de `EVIDENCE_ENCRYPTION_KEY` requiere conservar versiones de clave hasta que venza o se recifre toda evidencia anterior. El MVP usa una clave activa; no la reemplace mientras exista evidencia retenida sin un proceso de recifrado aprobado.
