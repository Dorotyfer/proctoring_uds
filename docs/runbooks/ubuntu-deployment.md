# Despliegue Ubuntu sin Docker ni Node

## Prerrequisitos

- Ubuntu x86_64 con Python 3.12, Apache 2.4, MariaDB accesible y S3/MinIO privado.
- Usuario de base de datos limitado al esquema de proctoring.
- Los cuatro grupos de pesos aprobados: YuNet, SFace, ambos archivos FasNet y SSDLite.
- Manifiesto `releaseReady: true` con SHA-256 reales. Un nombre de archivo o hash faltante bloquea el despliegue.

## Secretos y configuración

Copie `.env.example`, complete todos los valores y establezca:

```text
API_HOST=127.0.0.1
API_PORT=8000
API_PUBLIC_URL=https://campus.uds.edu.py/proctoring-api
PANEL_URL=/proctoring
WEB_ORIGIN=https://campus.uds.edu.py
MOODLE_ORIGIN=https://campus.uds.edu.py
MODEL_MANIFEST_PATH=/etc/proctoring/model-weights.json
INFERENCE_REQUESTED=true
```

Genere las claves AES y secretos fuera del repositorio. El instalador guarda el entorno y manifiesto con propietario `root:proctoring`, modo `0640`; el directorio de pesos es `0750`. No coloque secretos en argumentos, URLs, unidades systemd ni logs.

## Instalación atómica

```bash
sudo ./scripts/install-ubuntu.sh \
  --source "$PWD" \
  --env /ruta/segura/proctoring.env \
  --manifest /ruta/segura/model-weights.json \
  --models-source /medio/offline/modelos
```

El instalador crea una release inmutable bajo `/opt/proctoring/releases`, instala el extra Python `vision`, copia solo pesos cuyo SHA coincide y ejecuta `proctoring-models verify`. Luego aplica las migraciones aditivas y comprueba infraestructura antes de cambiar el symlink `current` atómicamente. Si falla el arranque posterior, restaura automáticamente la release anterior. Ni API ni worker arrancan si la verificación local falla. No existe descarga de modelos durante el arranque.

Instale `deploy/apache/proctoring.conf` únicamente en el vhost servido detrás del TLS institucional. El formato de access log usa `%U`, no registra query strings y por tanto evita registrar tokens SSO. Apache no sobrescribe el CSP dinámico de FastAPI y solo publica las rutas Python declaradas.

## Operación

```bash
sudo systemctl status proctoring-api proctoring-worker
sudo systemctl list-timers 'proctoring-*'
sudo -u proctoring /opt/proctoring/current/venv/bin/proctoring-check-infra
sudo -u proctoring /opt/proctoring/current/venv/bin/proctoring-purge
sudo -u proctoring /opt/proctoring/current/venv/bin/proctoring-purge-staging
sudo -u proctoring /opt/proctoring/current/venv/bin/proctoring-models verify --manifest /etc/proctoring/model-weights.json
sudo -u proctoring /opt/proctoring/current/venv/bin/proctoring-benchmark \
  --manifest /etc/proctoring/model-weights.json \
  --corpus-dir /var/lib/proctoring/benchmark-corpus \
  --samples 100
```

Comandos instalados: `proctoring-api`, `proctoring-worker`, `proctoring-migrate`, `proctoring-check-infra`, `proctoring-purge`, `proctoring-purge-staging`, `proctoring-models`, `proctoring-fixtures`, `proctoring-load` y `proctoring-benchmark`.

El corpus del benchmark debe ser institucional, autorizado, no productivo y contener JPEG válidos entre 320×240 y 1280×720, con máximo 200 KB. Cada trabajo medido ejecuta DeepFace y SSDLite con pesos locales verificados. La salida calcula `workersFor15JobsPerSecond`, informa el pico de RAM y reserva 30%; solo una ejecución real produce `slaValid: true`. `--fake` sirve únicamente para comprobar el formato y nunca acredita capacidad.

Fixtures sintéticos y carga acotada:

```bash
proctoring-fixtures --sessions 20 --seed acceptance-01
PILOT_API_URL=https://campus.uds.edu.py/proctoring-api \
MOODLE_INTEGRATION_KEY='valor-secreto' \
proctoring-load --sessions 1000 --concurrency 50 --max-retries 2 --seed load-01
```

No ejecute carga contra producción durante un examen. La salida agrupa errores por código sanitizado y nunca imprime la clave de integración.

## Rollback

```bash
sudo ./scripts/rollback-ubuntu.sh
```

El rollback intercambia el symlink `current` de forma atómica, vuelve a verificar modelos y reinicia API/worker. Las migraciones son aditivas y se conservan; no restaure un backup de base de datos sobre actividad posterior. Si una release introduce una incompatibilidad de datos, detenga captura, preserve MariaDB/S3 y siga un plan institucional específico.

## Retiro de la release heredada

La release Node anterior no forma parte del código ni de los entregables activos. Durante la migración, el operador debe detener y deshabilitar sus servicios en el servidor, impedir que atienda tráfico y conservar su directorio de release y logs con acceso restringido durante siete días. No debe ejecutarse en paralelo con FastAPI.

Durante esa ventana se monitorea la release Python. Un rollback excepcional usa una release histórica etiquetada en Git y requiere aprobación de incidente; nunca revierte migraciones ni borra tablas. Cumplidos los siete días y aprobada la estabilidad, el operador elimina el directorio heredado según el procedimiento institucional. Esta retención es una operación del servidor, no una dependencia activa.
