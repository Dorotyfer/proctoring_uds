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

4. Creá la ruta de evidencia indicada por `EVIDENCE_STORAGE_PATH` y concedé acceso únicamente a la cuenta que ejecuta la API/worker. No uses una carpeta bajo `C:\Apache24\htdocs`, `C:\xampp\htdocs` ni ningún `DocumentRoot` de Apache.

   ```powershell
   New-Item -ItemType Directory -Force -Path C:\proctoring-data\evidence
   ```

5. Confirmá la conexión MySQL:

   ```powershell
   pnpm infra:check
   ```

El chequeo usa exclusivamente las variables `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER` y `MYSQL_PASSWORD` de `.env`.

6. Aplicá la migración de sesiones con los valores de tu `.env`:

   ```powershell
   Get-Content -Raw apps/api/src/db/migrations/001_sessions.sql | mysql --host=127.0.0.1 --port=3306 --user=proctoring --password proctoring
   ```

## Seguridad del almacenamiento de evidencia

`EVIDENCE_STORAGE_PATH` debe estar fuera de Apache. Apache no debe tener alias, virtual host ni permisos de lectura sobre esa ruta. La API entrega evidencia solo tras validar permisos y registrar la auditoría; nunca se debe enlazar ni servir el directorio directamente. En Linux, una ubicación apropiada es `/var/lib/proctoring/evidence` con propiedad de la cuenta del servicio API/worker.

## Logs

Usá el visor de logs de MySQL o el registro configurado por tu instalación. La API y el worker se ejecutan como procesos locales y deben registrar su salida en el mecanismo de servicios elegido.

## Limpieza

No hay servicios en contenedores. Para eliminar datos de desarrollo, borrá manualmente las filas de la base `proctoring` y la evidencia cifrada dentro de `EVIDENCE_STORAGE_PATH`, conforme a la política de retención aplicable.
