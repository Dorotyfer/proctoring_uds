# Proctoring UDS

MVP de proctoring para Moodle compuesto por dos sistemas independientes:

- plugins PHP instalables en Moodle para configuración, permisos e integración con cuestionarios;
- API JavaScript externa con PostgreSQL propia y almacenamiento S3 compatible para sesiones, eventos, alertas y evidencia.

La API no consulta la base de datos de Moodle. La comunicación usa HTTPS y una clave servidor-a-servidor que nunca se entrega al navegador.

## Estado

- Contratos compartidos de sesión y eventos.
- API de creación idempotente, salud de PostgreSQL, tokens temporales, activación y cierre de sesiones.
- Recepción de eventos autenticada, idempotente, limitada por sesión y preparada para reintentos.
- Plugin local Moodle con configuración y capacidades.
- Regla `quizaccess_proctoring` con política por cuestionario e integración con el ciclo del intento.
- Aplicación web de preparación con cámara, encuadre, captura cifrada y prueba de vida.
- Monitor persistente dentro del intento con cola local, reintentos y alertas revisables.
- Evidencia cifrada en almacenamiento de objetos, retención configurable y auditoría de cada acceso.
- Panel SSO de revisión con sesiones, alertas, notas y autorización aplicada por curso en el servidor.
- Herramientas de fase 7 para prueba vertical, fixtures deterministas, recuperación, carga de 1.000 sesiones y aceptación del piloto.
- Pendiente antes del uso real: ejecutar la matriz de dispositivos, PHPUnit y pruebas contra PostgreSQL/S3/Moodle institucionales.

Consulte [el plan del MVP](docs/mvp-implementation-plan.md), [la arquitectura](docs/architecture.md), [la instalación en Moodle](docs/runbooks/moodle-installation.md) y [la aceptación del piloto](docs/runbooks/mvp-acceptance.md).
