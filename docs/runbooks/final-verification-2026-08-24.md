# Verificación final de la migración FastAPI

Fecha: 2026-08-24

Rama: `codex/fastapi-server-vision`

Base: `565ec96d675372153978c111d9ab3cf4c138e448`
Alcance: `565ec96d675372153978c111d9ab3cf4c138e448..HEAD`

## Resultado implementado

- Runtime Python 3.12 con FastAPI, Jinja2 y JavaScript nativo.
- API y worker de inferencia separados; MariaDB mantiene la cola durable y S3/MinIO recibe staging cifrado.
- Moodle conserva sesiones internas, SSO, permisos por curso y flujo de intento; solo se agregó `failurePolicy`.
- DeepFace usa SFace, YuNet y FasNet; torchvision usa SSDLite320/MobileNetV3.
- Instalación, rollback, Apache, systemd, timers y operación se entregan sin Docker ni toolchain Node.
- El instalador rechaza índices/URLs y usa un wheelhouse institucional con lock transitivo, `--no-index` y `--require-hashes`.
- El benchmark real exige manifiesto aprobado, pesos locales verificados y corpus JPEG autorizado; el modo simulado queda marcado `slaValid: false`.
- Los artefactos directos Python tienen versión, licencia, nombre de wheel y SHA-256 en el inventario. Los pesos mantienen SHA-256 nulo y estado bloqueante hasta recibir los archivos institucionales.
- La ruta heredada `/session/{token}` se conserva, pero Apache la excluye del access log y el navegador elimina inmediatamente el bearer de la URL visible.
- Errores operativos de DeepFace/SSDLite y fallos totales de preload se convierten en reintentos durables; en el tercer intento se aplica `failurePolicy` sin exigir modelos cargados. Observaciones, eventos y alertas son idempotentes por trabajo.

## Evidencia ejecutada

Entorno local: Windows 11, Python 3.12.13 y Selenium 4.47.0.

| Verificación | Resultado |
| --- | --- |
| `python -m pytest -q -rs` | 234 aprobadas, 4 omitidas, 0 fallidas, 0 advertencias |
| Selenium con Chrome headless y cámara falsa | 1 aprobada; tres JPEG reales de 640×480 y máximo 200 KB |
| `python -m compileall` | aprobado para fuentes y pruebas Python |
| `python -m pip check` | ninguna dependencia instalada rota |
| Resolución del extra `vision` | dry-run aprobado; torchvision 0.28.0 declara exactamente `torch==2.13.0` |
| Importación de API, CLI, worker, modelos, benchmark y piloto | aprobada |
| `bash -n` sobre instalación y rollback | aprobada |
| Generador de entregables PowerShell 7 | aplicación y dos ZIP Moodle reconstruidos; exclusiones Python-only aprobadas |
| ZIP Moodle | 13 entradas local y 10 quizaccess; raíz única `proctoring/` |
| Inventario | 19 artefactos Python directos con SHA-256; manifiesto estructural válido |
| Verificación de pesos de ejemplo | bloqueada de forma esperada porque no están aprobados |
| Benchmark simulado | salida válida, pero `slaValid: false` como exige la política |
| Manual DOCX | 9 páginas renderizadas e inspeccionadas; accesibilidad high=0, medium=0, low=0 |
| Escaneo estructural | sin rutas activas Node/pnpm/Next/React/Human ni paquete Python heredado |
| Escaneo semántico | sin inferencia emocional ni API worker/service que modifique nota o intento Moodle |
| Escaneo de secretos | sin patrones de clave privada o access key en fuentes activas |

Omisiones reportadas por pytest:

1. MariaDB de análisis: falta `TEST_DATABASE_URL`.
2. Evidencia MariaDB/S3: faltan `TEST_DATABASE_URL` y `TEST_S3_*`.
3. Inferencia: falta `MODEL_MANIFEST_PATH` con pesos locales aprobados.
4. Panel MariaDB: falta `TEST_DATABASE_URL`.

## Cierre de revisión independiente

| Hallazgo | Resolución |
| --- | --- |
| Bearer del navegador en el path registrado por Apache | `SetEnvIf` excluye la ruta completa del access log; el navegador ejecuta `history.replaceState` y el runbook exige la misma exclusión en el gateway TLS. |
| Fallo ordinario DeepFace/Torchvision no aplicaba `failurePolicy` | Los dos adaptadores traducen fallos operativos a `AnalysisUnavailable`; el worker conserva separados los errores fuera de la frontera de inferencia. |
| Fallo total de preload dejaba trabajos pendientes indefinidamente | El worker permanece vivo, reclama y reintenta de forma durable; al tercer intento usa un procesador de fallback que no construye adaptadores y aplica `block|allow_with_alert`. El bundle limpia cargas parciales antes de reintentar. |
| Reintento podía duplicar observaciones/eventos/alertas | Migración 011 agrega clave única de trabajo; repositorios usan upsert e identificadores UUIDv5 deterministas. |
| `pip install` podía consultar el índice sin verificar hashes | El instalador exige wheelhouse y lock transitivo externo, bloquea URLs/índices y usa `--no-index --require-hashes`. |
| Posible incompatibilidad Torch/Torchvision | Refutada con metadatos del artefacto: torchvision 0.28.0 requiere exactamente torch 2.13.0; el dry-run resolvió el extra completo. |
| BLOB históricos en migración 003 | Conservados intencionalmente para rollback; el runtime nuevo no los escribe y retirarlos sería una migración destructiva posterior. |

## Gates obligatorios del servidor de destino

La implementación está cerrada, pero no debe declararse release productivo hasta ejecutar en Ubuntu:

1. Aprobar los cinco artefactos de modelo, registrar SHA-256 reales y cambiar ambos manifiestos a `releaseReady: true`.
2. Ejecutar las cuatro pruebas omitidas contra MariaDB y S3/MinIO desechables, incluyendo migración desde 001–007 y evidencia histórica.
3. Ejecutar PHPUnit e instalación/upgrade de ambos plugins en la versión Moodle institucional.
4. Validar `apache2ctl configtest`, todas las unidades con `systemd-analyze verify`, permisos, timers, instalación atómica y rollback.
5. Ejecutar corpus biométrico/ambiental autorizado y benchmark real; calcular workers y confirmar la reserva de 30% de RAM.
6. Ejecutar 1.000 perfiles y 100 sesiones concurrentes durante una hora, y registrar API p95, preparación p95, edad de cola, pérdidas y reintentos.
7. Observar siete días estables antes de retirar la release Node histórica detenida.

No se ejecutó PHP, Apache ni systemd localmente porque esos binarios no están disponibles en Windows. Tampoco se desplegó en un host remoto: no se proporcionaron acceso ni infraestructura de destino. Estos límites son externos y no se sustituyen con resultados simulados.

Las columnas BLOB de captura que existen desde la migración histórica 003 se conservan únicamente para rollback y compatibilidad de datos. El runtime Python no las escribe: todo frame nuevo se cifra y almacena en S3/MinIO. Retirarlas exige una migración destructiva posterior a la ventana de rollback y no forma parte de este corte aditivo.
