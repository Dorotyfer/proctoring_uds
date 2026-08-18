# Informe de migración local a MySQL

## Estado

La migración de código y configuración versionada está completada. La comprobación de conectividad local queda pendiente de que el operador configure las credenciales MySQL reales en `.env`.

## Cambios aplicados

- Se eliminó la configuración de infraestructura anterior y sus dependencias.
- `.env.example` define únicamente `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` y `EVIDENCE_STORAGE_PATH`.
- `scripts/check-infra.mjs` usa `mysql2/promise` para abrir una conexión MySQL desde `.env` y ejecutar `SELECT 1`.
- La migración `001_sessions.sql` usa tipos, índices y sintaxis MySQL 8/InnoDB.
- `SessionRepository` usa sentencias preparadas MySQL con `execute` y placeholders `?`.
- El runbook documenta creación de usuario/base, aplicación de migración y almacenamiento de evidencia fuera de Apache sin alias ni permisos de lectura para el servidor web.
- El plan del MVP se actualizó para worker local y trabajos MySQL.

## Pruebas realizadas

| Comando | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | Correcto |
| `pnpm test` | Correcto: 13 pruebas, 0 fallos |
| `node --check scripts/check-infra.mjs` | Correcto |
| `node --check apps/api/src/repositories/session-repository.js` | Correcto |
| `git diff --check` | Correcto |

Las pruebas nuevas se ejecutaron primero contra la versión anterior y fallaron por los motivos esperados: el chequeo informaba dependencias antiguas y el repositorio invocaba `query` en lugar de `execute`.

## Verificación pendiente de la instalación local

`pnpm infra:check` devuelve `Unavailable dependencies: MySQL`. El diagnóstico confirma que el `.env` local conservaba solo claves anteriores y contiene cero variables `MYSQL_*`; no se alteraron credenciales locales. Copiá los valores de `.env.example` a `.env`, usá la cuenta MySQL creada para la aplicación y ejecutá de nuevo:

```powershell
pnpm infra:check
```

## Correcciones de revisión

- `EVIDENCE_STORAGE_PATH` y `APACHE_DOCUMENT_ROOTS` ahora son obligatorios. El chequeo confirma que la evidencia existe, es un directorio escribible y no está dentro de ningún directorio público Apache configurado.
- El runbook exige enumerar cada `DocumentRoot` y destino local de `Alias`, y contiene comandos `icacls` verificables para retirar herencia, otorgar acceso a API/worker y denegar lectura a la identidad de Apache.
- Las cinco variables `MYSQL_*` son obligatorias. `MYSQL_PORT` debe ser un entero decimal completo entre 1 y 65535; no existen valores de reserva silenciosos.
- `pnpm db:migrate:sessions` carga `.env` mediante Node y ejecuta la migración con `mysql2`, sin exponer la contraseña como argumento de la línea de comandos.

### Verificación de las correcciones

- `pnpm test:infra`: 8 pruebas, 0 fallos.
- El `.env` local heredado produce errores de configuración descriptivos para `pnpm infra:check` y `pnpm db:migrate:sessions`; no intenta una conexión de reserva.
