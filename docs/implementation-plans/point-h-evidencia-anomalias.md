# Punto H: evidencia y anomalías

## Objetivo

Conservar evidencia mínima, cifrada y revisable para anomalías confirmadas.

## Diseño

Las capturas ingresan a un staging acotado y cifrado. El worker correlaciona observaciones, aplica confirmación y conserva solo la evidencia que exige la política. Los objetos se cifran antes de persistir y se acceden mediante URLs temporales auditadas.

En el navegador una imagen pendiente vive solo como `Blob` en memoria. Ante congestión u offline, la nueva reemplaza a la anterior; nunca se escribe en IndexedDB, almacenamiento local o de sesión. La cola persistente solo contiene eventos JSON técnicos.

## Gate

Validar cifrado, límites de staging, reemplazo newest-only, autorización de evidencia, auditoría, retención y purga idempotente. Fallos de almacenamiento no pueden crear una conclusión local ni perder trazabilidad del estado.
