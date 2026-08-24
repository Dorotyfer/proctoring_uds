# Contratos compartidos

## Plataforma

- Moodle/PHP origina sesiones y autorización por curso.
- FastAPI/Python sirve API, Jinja2, módulos ES y workers.
- MariaDB persiste estado; S3 compatible conserva evidencia cifrada.
- YuNet, SFace, FasNet y SSDLite se ejecutan solo en servidor.

## Sesión de navegador

El token de arranque existe solo en el DOM inicial, se consume y elimina. El navegador puede enviar JPEG y eventos técnicos JSON, pero no persiste imágenes, base64, tokens o descriptores. Las respuestas del servidor son la única fuente de estados biométricos y alertas.

## Observaciones y alertas

Cada observación posee UUID idempotente, sesión, tiempo del servidor, tipo, versión de modelo y resultado técnico. Las políticas de confirmación se aplican en servidor. Una falla de red, visibilidad o cámara no equivale a fraude.

## Modelos

- YuNet: detección y alineación facial.
- SFace: descriptor e identidad.
- FasNet: prueba de vida.
- SSDLite: detección de personas y objetos configurados.

No existe contrato de emociones. Pesos, hashes aprobados, umbrales y métricas se registran en configuración/release, no se inventan en el plan.

## Seguridad

Autorización por curso, CSRF en mutaciones del panel, evidencia cifrada, acceso temporal auditado, CSP estricta y URL de retorno validada contra el origen Moodle exacto. Las migraciones son aditivas y las tablas históricas se conservan.
