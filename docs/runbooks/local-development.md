# Desarrollo local

## Requisitos

- Node.js 20.6 o posterior.
- pnpm 11 o posterior.
- MySQL 8 instalado y en ejecución.
- Una ruta local para la evidencia que esté fuera del directorio público de Apache.

## Configuración

1. Copiá el archivo de variables de entorno:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Instalá las dependencias del workspace:

   ```powershell
   pnpm install
   ```

3. Creá la base de datos y el usuario de aplicación (reemplazá la contraseña antes de ejecutar):

   ```powershell
   mysql -u root -p -e "CREATE DATABASE proctoring CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; CREATE USER 'proctoring'@'localhost' IDENTIFIED BY 'change-this-local-password'; GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX ON proctoring.* TO 'proctoring'@'localhost'; FLUSH PRIVILEGES;"
   ```

4. Configurá `APACHE_DOCUMENT_ROOTS` con todos los directorios que Apache publica: el `DocumentRoot` de cada virtual host y cualquier destino local de `Alias`. En Windows, separalos con `;`. Creá la ruta de evidencia indicada por `EVIDENCE_STORAGE_PATH`; no puede estar contenida por ninguna de esas rutas.

   ```powershell
   New-Item -ItemType Directory -Force -Path C:\proctoring-data\evidence
   ```

   La cuenta API/worker debe ser distinta de la identidad de Apache. Restringí la ACL y verificá la denegación explícita antes de iniciar servicios. Reemplazá `NT SERVICE\Apache2.4` por la identidad que aparece en el servicio Apache de esta instalación.

   ```powershell
   $evidencePath = 'C:\proctoring-data\evidence'
   $apiWorkerIdentity = $env:USERNAME # Reemplazá por la cuenta del servicio API/worker si corresponde.
   $apacheIdentity = 'NT SERVICE\Apache2.4'
   icacls $evidencePath /inheritance:r
   icacls $evidencePath /grant:r "${apiWorkerIdentity}:(OI)(CI)M"
   icacls $evidencePath /deny "${apacheIdentity}:(OI)(CI)(RX)"
   icacls $evidencePath
   ```

5. Confirmá la conexión MySQL y la seguridad mínima de la ruta de evidencia:

   ```powershell
   pnpm infra:check
   ```

El chequeo exige `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `EVIDENCE_STORAGE_PATH` y `APACHE_DOCUMENT_ROOTS` desde `.env`. Rechaza puertos malformados, rutas que no existen o no son escribibles y evidencia bajo una ruta pública Apache configurada.

6. Aplicá la migración de sesiones con los valores de tu `.env`:

   ```powershell
   pnpm db:migrate:sessions
   ```

   El comando carga `.env` en el proceso Node y establece la conexión con `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER` y `MYSQL_PASSWORD`; la contraseña no se expone en la línea de comandos ni se pasa como argumento de MySQL.

## Seguridad del almacenamiento de evidencia

`EVIDENCE_STORAGE_PATH` debe estar fuera de Apache. Apache no debe tener alias, virtual host ni permisos de lectura sobre esa ruta. Enumerá sus directorios públicos en `APACHE_DOCUMENT_ROOTS` para que `pnpm infra:check` los compare con la ruta real de evidencia. La API entrega evidencia solo tras validar permisos y registrar la auditoría; nunca se debe enlazar ni servir el directorio directamente. En Linux, una ubicación apropiada es `/var/lib/proctoring/evidence` con propiedad de la cuenta del servicio API/worker.

## Logs

Usá el visor de logs de MySQL o el registro configurado por tu instalación. La API y el worker se ejecutan como procesos locales y deben registrar su salida en el mecanismo de servicios elegido.

## Limpieza

No hay servicios en contenedores. Para eliminar datos de desarrollo, borrá manualmente las filas de la base `proctoring` y la evidencia cifrada dentro de `EVIDENCE_STORAGE_PATH`, conforme a la política de retención aplicable.
