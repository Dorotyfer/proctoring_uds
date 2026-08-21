# Desarrollo local

El servicio de proctoring es independiente de Moodle. No usa Docker ni consulta la base de datos de Moodle.

## Requisitos

- Node.js 22 o superior
- pnpm 11 o superior
- Una instancia MariaDB 10.11.14 o superior accesible mediante `DATABASE_URL`
- Un almacenamiento de objetos compatible con S3 accesible por HTTPS
- Moodle 4.3.3 o superior y PHP 8.1 o superior para el plugin

## API independiente

1. Copie `.env.example` a `.env` y configure MariaDB, los secretos, las URLs públicas y las credenciales S3. Use `DATABASE_URL=mysql://proctoring:contraseña@127.0.0.1:3306/proctoring`. Mantenga `S3_SERVER_SIDE_ENCRYPTION=AES256`; para una instancia MinIO local sin KMS, use explícitamente `none` solo durante desarrollo.
2. Instale dependencias con `pnpm install`.
3. Ejecute las migraciones versionadas con `pnpm --filter @proctoring/api migrate`.
4. Inicie la API con `pnpm api:dev`.

Antes de ejecutar una prueba real, confirme los tres servicios con `pnpm api:infra:check`. El comando comprueba la API, MariaDB y el bucket S3/MinIO configurado.

La API escucha en `http://127.0.0.1:3001` por defecto. En producción debe exponerse por HTTPS y limitarse a la red desde la que Moodle pueda alcanzarla.

`GET /health` devuelve `200` cuando MariaDB está disponible y `503` cuando la API no puede consultar su base de datos. No incluye credenciales ni detalles de conexión.

Genere `EVIDENCE_ENCRYPTION_KEY` y `BIOMETRIC_ENCRYPTION_KEY` con `openssl rand -base64 32`. Mantenga `BIOMETRIC_MATCH_THRESHOLD=0.5` salvo que la política institucional defina otro umbral. Configure `WEB_ORIGIN` con el origen exacto de la aplicación web para restringir CORS.

Programe `pnpm api:evidence:purge` al menos una vez al día. La tarea elimina objetos vencidos, registra la acción y marca el metadato como eliminado.

## Aplicación web

1. Copie `apps/web/.env.example` a `apps/web/.env.local`.
2. Configure la URL pública de la API y el origen exacto de Moodle.
3. Ajuste `NEXT_PUBLIC_EVIDENCE_INTERVAL_SECONDS` entre 30 y 600 segundos según la política institucional.
4. Inicie el frontend con `pnpm web:dev`.

Los modelos de `@vladmandic/human` se copian automáticamente desde la dependencia instalada hacia `public/models` antes de desarrollo y compilación. Esa copia no se versiona.

## Validación del piloto

- `pnpm pilot:fixtures` imprime sesiones deterministas sin datos personales.
- `pnpm pilot:load` ejecuta el flujo activo contra una API configurada; no lo ejecute contra producción durante exámenes.
- `pnpm test` incluye la prueba vertical y las recuperaciones automatizadas.
- `pnpm web:build` valida el frontend de estudiante y panel.

La ejecución institucional completa está en `docs/runbooks/mvp-acceptance.md`.

## Plugin Moodle

1. Copie `apps/moodle/local/proctoring` a `<moodle-root>/local/proctoring`.
2. Entre como administrador y complete la instalación de plugins.
3. Configure URL de la API, clave de integración, URL del panel y el mismo `PANEL_SSO_SECRET` de la API desde Administración del sitio > Plugins locales > Proctoring.

La clave de integración se guarda únicamente en la configuración protegida de Moodle y viaja de servidor a servidor. El navegador no recibe esta clave.
