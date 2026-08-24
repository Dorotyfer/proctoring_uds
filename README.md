# Proctoring UDS

Sistema de supervisión para Moodle cuyo único runtime de aplicación es Python 3.12.

## Componentes activos

- plugins PHP `local_proctoring` y `quizaccess_proctoring` para Moodle;
- API, páginas Jinja2, módulos ES nativos y workers en FastAPI;
- MariaDB para estado transaccional y almacenamiento S3 compatible para evidencia cifrada;
- inferencia biométrica en servidor con YuNet, SFace y FasNet;
- detección de objetos en servidor con SSDLite.

El navegador solicita consentimiento, captura cámara, envía JPEG y registra eventos técnicos. No carga modelos, no calcula descriptores ni conclusiones biométricas o de incidencia. El producto no implementa análisis de emociones.

## Estructura

- `apps/api`: paquete Python `proctoring`, migraciones y configuración de modelos.
- `apps/moodle`: fuentes instalables de los dos plugins Moodle.
- `deploy`: Apache y unidades systemd para API y worker.
- `scripts`: instalación, rollback y construcción reproducible de entregables.
- `docs`: arquitectura, contratos y runbooks operativos.
- `entregables`: aplicación Python-only y ZIPs Moodle generados.

## Desarrollo local

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -e './apps/api[test]'
cp .env.example .env
set -a && source .env && set +a
proctoring-migrate
proctoring-api
```

Los pesos se aprovisionan fuera de línea en las rutas configuradas. Sus hashes deben verificarse contra valores aprobados por la institución; este repositorio no incluye pesos ni inventa hashes.

## Entregables

En PowerShell:

```powershell
./scripts/build-deliverables.ps1
```

El constructor sincroniza fuentes, crea ambos ZIP Moodle y rechaza runtimes web retirados, secretos, caches, tests y pesos. Consulte `docs/runbooks/ubuntu-deployment.md` para despliegue y rollback.
