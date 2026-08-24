# Desarrollo local

## Requisitos

- Python 3.12 y `venv`;
- MariaDB compatible con el esquema incluido;
- almacenamiento S3 compatible para flujos de evidencia;
- PHP/Moodle solo para integración de plugins.

## Preparación

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -e './apps/api[test]'
cp .env.example .env
set -a && source .env && set +a
proctoring-migrate
proctoring-api
```

En otra terminal, con el mismo entorno:

```bash
proctoring-worker
```

Las variables obligatorias y rutas de modelos están documentadas en `.env.example`. Los archivos de modelo se obtienen por el proceso institucional fuera de línea y no se agregan al repositorio.

## Frontend

FastAPI sirve plantillas Jinja2, CSS y módulos ES nativos. No hay instalación de dependencias ni compilación del navegador. Para probar cámara se usa HTTPS o `localhost`.

## Comprobaciones para la fase final

```bash
python -m compileall -q apps/api/src/proctoring apps/api/tests
python -m pytest
```

Las pruebas Selenium y Moodle/PHP se ejecutan en la validación integral, con los servicios y fixtures correspondientes.
