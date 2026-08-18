# Desarrollo local

## Requisitos

- Node.js 20.6 o posterior.
- pnpm 11 o posterior.
- Docker Desktop con Docker Compose v2 habilitado.

## Configuración

1. Copiá el archivo de variables de entorno:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Instalá las dependencias del workspace:

   ```powershell
   pnpm install
   ```

3. Iniciá PostgreSQL, Redis y MinIO:

   ```powershell
   pnpm infra:up
   ```

4. Confirmá que los tres servicios estén disponibles:

   ```powershell
   pnpm infra:check
   ```

PostgreSQL queda disponible en `localhost:5432`, Redis en `localhost:6379`, y MinIO ofrece su API en `localhost:9000` y la consola en `localhost:9001`.

## Logs

Para seguir los logs de todos los servicios:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml logs -f
```

Para un único servicio, agregá su nombre al final, por ejemplo `postgres`, `redis` o `minio`.

## Limpieza

Para detener los contenedores sin borrar los datos locales:

```powershell
pnpm infra:down
```

Para eliminar los contenedores y los volúmenes de datos locales:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml down --volumes
```
