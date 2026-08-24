# Diseño: migración de persistencia a MariaDB 10.11

> **Documento histórico:** registra una migración anterior sobre el runtime retirado. Sus comandos no deben ejecutarse; use los runbooks Python vigentes.

## Objetivo

La API Node.js de Proctoring UDS usará exclusivamente MySQL/MariaDB 10.11.14 o posterior. PostgreSQL deja de ser una dependencia del código, las migraciones, pruebas, documentación y paquete distribuible. No existe información que migrar desde PostgreSQL.

## Alcance

- Migrar `apps/api` de `pg` a `mysql2` usando su API de promesas.
- Mantener `DATABASE_URL` como configuración única de conexión, ahora con el formato `mysql://usuario:contraseña@host:3306/proctoring`.
- Convertir las cuatro migraciones SQL y el seguimiento de migraciones para MariaDB.
- Conservar exactamente los contratos HTTP y los datos de dominio que recibe el frontend y Moodle.
- Actualizar pruebas, README y runbooks que nombran PostgreSQL.
- Replicar todos los cambios de la API, paquete y documentación operativa aplicable en `entregables/aplicacion`, que es la copia distribuible del proyecto.

Quedan fuera de alcance la importación de datos PostgreSQL, Docker, y cualquier modificación de la base propia de Moodle.

## Arquitectura

La API creará pools de `mysql2/promise` mediante una pequeña fábrica compartida de conexión. Cada repositorio conserva su interfaz pública actual y utilizará `pool.execute(sql, values)` para consultas simples; el repositorio de eventos tomará una conexión del pool para su transacción y la liberará en `finally`.

El migrador abrirá una conexión MariaDB, creará `proctoring_schema_migrations`, aplicará los archivos `.sql` ordenados y registrará cada archivo dentro de la misma transacción. Se utilizará `multipleStatements: true` únicamente para el migrador, porque cada archivo contiene varias sentencias; los repositorios mantendrán una sentencia por ejecución.

## Modelo físico MariaDB

- Identificadores UUID: `CHAR(36)` con valores generados por `crypto.randomUUID()` en Node.js.
- Instantes: `DATETIME(3)` en UTC. Las consultas SQL usarán `UTC_TIMESTAMP(3)`; la API convertirá las fechas devueltas a ISO 8601 como ahora.
- Documentos JSON: `JSON`, serializados con `JSON.stringify` al escribir y analizados cuando `mysql2` los devuelva como texto.
- Binarios: `BLOB`; hashes: `CHAR(64)`.
- IP de auditoría: `VARCHAR(45)` para IPv4 e IPv6.
- Claves numéricas de auditoría: `BIGINT UNSIGNED AUTO_INCREMENT`.
- Índices de evidencia: índices compuestos `(deleted_at, session_id, created_at)` y `(deleted_at, expires_at)` sustituyen los índices parciales PostgreSQL y preservan los filtros operativos de evidencia no eliminada.

Las restricciones `CHECK`, claves foráneas con `ON DELETE CASCADE`, índices únicos y `utf8mb4`/InnoDB se declararán explícitamente y deberán ser compatibles con MariaDB 10.11.

## Conversión de consultas

- Todos los marcadores `$n` pasarán a `?`.
- `ON CONFLICT` pasará a `ON DUPLICATE KEY UPDATE`, devolviendo la fila mediante un `SELECT` posterior cuando MariaDB no soporte el `RETURNING` usado hoy.
- `RETURNING` y `UPDATE ... FROM` se reemplazarán por `UPDATE` seguido de `SELECT`, dentro de una transacción si la operación necesita atomicidad.
- `ANY($n::text[])` se construirá con una lista de `?` validada y no vacía; el filtro institucional continuará sin condición de curso.
- El conteo condicional con `FILTER` se reemplazará por `SUM(alerts.status = 'open')` y se normalizará con `Number`.
- El límite de eventos por sesión usará un bloqueo de fila de la sesión mediante `SELECT ... FOR UPDATE`, eliminando la dependencia de `pg_advisory_xact_lock` y preservando idempotencia y límite de 120 eventos/minuto.

## Configuración y ejecución del servidor

`apps/api/src/server.js` seguirá creando los repositorios y arrancando Fastify sin cambios de interfaz. `DATABASE_URL` deberá aceptar el protocolo `mysql:`; la documentación incluirá creación de base y usuario MariaDB con privilegios limitados, ejecución de `pnpm --filter @proctoring/api migrate`, inicio de `pnpm api:dev` y la comprobación `GET /health`.

El nombre de la variable se conserva para no modificar las unidades de servicio, Moodle ni despliegues existentes. La verificación de salud seguirá responderá `200` con `{ "status": "ok", "database": "available" }` y `503` si MariaDB no está disponible.

## Pruebas y validación

Las pruebas unitarias existentes seguirán usando dobles de repositorio donde corresponda. Se actualizarán los textos y valores de configuración a una URL MySQL. Se añadirán pruebas de las conversiones que no cubren los dobles: normalización de filas MariaDB, serialización JSON, consulta con ámbitos de curso y semántica de idempotencia/límite de eventos.

La validación final ejecutará `pnpm install --frozen-lockfile`, `pnpm --filter @proctoring/api test`, `pnpm test` y el migrador contra una instancia real MariaDB 10.11.14 vacía. Tras aplicar migraciones, se verificará `SHOW TABLES`, claves foráneas, índices, creación idempotente de sesión, inserción idempotente de eventos y el endpoint `/health`.

## Copia distribuible y documentación

`entregables/aplicacion` deberá recibir las mismas fuentes API, manifiesto de dependencias y lockfile que la raíz. Los documentos de arquitectura, README, desarrollo local, aceptación, soporte, rotación de secretos y manual generado sustituirán las referencias de PostgreSQL por MariaDB/MySQL; el script generador del manual se actualizará y regenerará el `.docx` para mantenerlo coherente.
