# Desarrollo local

El servicio de proctoring es independiente de Moodle. No usa Docker ni consulta la base de datos de Moodle.

## Requisitos

- Node.js 22 o superior
- pnpm 11 o superior
- Una instancia PostgreSQL accesible mediante `DATABASE_URL`
- Moodle 4.3.3 o superior y PHP 8.1 o superior para el plugin

## API independiente

1. Copie `.env.example` a `.env` y configure `DATABASE_URL`, `MOODLE_INTEGRATION_KEY` y `JWT_SECRET`.
2. Instale dependencias con `pnpm install`.
3. Ejecute las migraciones versionadas con `pnpm --filter @proctoring/api migrate`.
4. Inicie la API con `pnpm api:dev`.

La API escucha en `http://127.0.0.1:3001` por defecto. En producción debe exponerse por HTTPS y limitarse a la red desde la que Moodle pueda alcanzarla.

`GET /health` devuelve `200` cuando PostgreSQL está disponible y `503` cuando la API no puede consultar su base de datos. No incluye credenciales ni detalles de conexión.

## Plugin Moodle

1. Copie `apps/moodle/local/proctoring` a `<moodle-root>/local/proctoring`.
2. Entre como administrador y complete la instalación de plugins.
3. Configure URL de la API, clave de integración y URL del panel desde Administración del sitio > Plugins locales > Proctoring.

La clave de integración se guarda únicamente en la configuración protegida de Moodle y viaja de servidor a servidor. El navegador no recibe esta clave.
