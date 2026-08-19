# Proctoring UDS

MVP de proctoring para Moodle compuesto por dos sistemas independientes:

- plugins PHP instalables en Moodle para configuración, permisos e integración con cuestionarios;
- API JavaScript externa con PostgreSQL propia para sesiones, eventos, alertas y evidencia.

La API no consulta la base de datos de Moodle. La comunicación usa HTTPS y una clave servidor-a-servidor que nunca se entrega al navegador.

## Estado

- Contratos compartidos de sesión y eventos.
- API de creación idempotente, salud de PostgreSQL, tokens temporales, activación y cierre de sesiones.
- Recepción de eventos autenticada, idempotente, limitada por sesión y preparada para reintentos.
- Plugin local Moodle con configuración y capacidades.
- Regla `quizaccess_proctoring` con política por cuestionario e integración con el ciclo del intento.
- Pendiente: aplicación web de preparación, alertas, evidencia y panel de revisión.

Consulte [el plan del MVP](docs/mvp-implementation-plan.md), [la arquitectura](docs/architecture.md) y [la instalación en Moodle](docs/runbooks/moodle-installation.md).
