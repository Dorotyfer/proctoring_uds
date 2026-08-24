# Privacidad y retención

## Datos

- MariaDB: sesiones, eventos técnicos, perfiles biométricos cifrados, alertas, revisiones y auditoría.
- S3 compatible: evidencia cifrada con metadatos mínimos.
- Navegador: solo cola IndexedDB de eventos JSON acotados; imágenes pendientes únicamente en memoria.

Nunca se persisten en el navegador tokens, JPEG/base64, descriptores faciales ni conclusiones locales. No se recopilan emociones.

## Retención

El worker Python aplica los plazos configurados por la institución y registra cada eliminación. Un borrado se considera completo cuando se elimina el objeto cifrado y se actualiza su registro transaccional. Los fallos se reintentan sin ampliar permisos ni ocultar el estado al operador.

## Acceso y solicitudes

El acceso a evidencia exige rol y curso autorizados, queda auditado y entrega una URL temporal. Las solicitudes de acceso, corrección o eliminación siguen el procedimiento institucional; una retención legal documentada prevalece hasta su liberación.

## Verificación operativa

```bash
source /opt/proctoring/current/.venv/bin/activate
proctoring-worker --once
journalctl -u proctoring-worker --since today
```

No se borran migraciones ni tablas históricas durante una limpieza de aplicación.
