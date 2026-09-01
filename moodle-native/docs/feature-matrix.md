# Matriz de capacidades

| Capacidad | Moodle nativo | Requisito adicional |
| --- | --- | --- |
| Consentimiento y preparación | Sí | HTTPS y permisos del navegador |
| Cámara y captura JPEG | Sí | HTTPS; el navegador puede denegarla |
| Liveness y descriptor biométrico | Sí, con modelo aprobado en el cliente | Calidad del dispositivo y política de consentimiento |
| Alertas y señales de rostro/entorno | Sí, mediante AMD y modelos del cliente | Modelo detector aprobado |
| Eventos de foco, visibilidad y pantalla completa | Sí | El navegador no garantiza señales del sistema operativo |
| Evidencia cifrada y privada | Sí | OpenSSL, clave de 32 bytes y `moodledata` respaldado |
| Panel docente/admin de corrección | Sí | Capacidades y contexto de curso |
| Revisión de alertas sin alterar notas | Sí | Revisión humana institucional |
| Exportación, eliminación y retención | Sí | Cron de Moodle funcionando |
| Safe Exam Browser | Adaptador opcional | SEB instalado y firma/configuración validada |
| Bloqueo de aplicaciones, portapapeles y procesos del sistema | No desde Moodle web | SEB o extensión aprobada; sigue siendo una señal adicional |
| Segunda cámara | Adaptador opcional | Segundo dispositivo y emparejamiento temporal |
| OCR documental | Punto de extensión local | Motor OCR instalado y política habilitada |
| Supervisión humana en vivo | Señales/polling nativos | Operador y canal institucional autorizado |

Un estado `unavailable` no se interpreta como aprobado. La política del
cuestionario decide si una indisponibilidad bloquea el intento o genera una
alerta para revisión.
