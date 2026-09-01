# Guía absoluta de desarrollo: Proctoring UDS

Este documento es la fuente única para decidir qué falta, qué está en desarrollo y cuándo el sistema puede pasar de MVP a producto final.

La revisión del desarrollo siempre debe hacerse contra los puntos **a–h**, las prioridades y las puertas de aceptación de esta guía. Los documentos históricos de diseño y planes anteriores no tienen autoridad sobre el desarrollo.

## Estado de referencia

La base MVP actual tiene sesiones Moodle, preparación con cámara, enrolamiento biométrico inicial, liveness, monitoreo facial básico, eventos, alertas revisables, evidencia cifrada, panel con autorización por curso y análisis de riesgo explicable.

Las pruebas automatizadas y el build local no son suficientes para declarar producto final. La aceptación final exige validación real de dispositivos, Moodle, SEB, MariaDB, almacenamiento S3/MinIO, carga y privacidad institucional.

## Criterios funcionales absolutos

| Punto | Estado objetivo | Falta para producto final | Criterios de aceptación |
|---|---|---|---|
| **a. Biometría continua** | Revalidación biométrica periódica durante todo el examen, sin interrupciones silenciosas. | Crear muestreo periódico, endpoint, persistencia, comparación contra el perfil activo, alerta, evidencia y reintentos. | Intervalo configurable de 15–120 segundos; tres muestras por verificación; una discrepancia solo alerta cuando las tres fallan; ningún descriptor en navegador, logs, Moodle o respuestas. |
| **b. Múltiples perfiles/versiones** | La institución debe decidir y documentar si necesita perfiles simultáneos o versiones históricas. | El MVP tiene un único perfil por estudiante y sobrescribe el descriptor al reinscribir. Implementar historial real si se exige versionado. | Una sola versión activa; versiones anteriores cifradas, revocables y auditables; reinscripción siempre autorizada y con consentimiento. |
| **c. Expresiones faciales** | Señal técnica revisable, nunca prueba automática de fraude ni inferencia psicológica. | Agregar confianza mínima, persistencia temporal, categorías técnicas, política explícita, feature flag, evidencia opcional y validación de sesgo. | Una lectura aislada no alerta; confianza menor a 0.60 no alerta; persistencia mínima de 30 segundos; modelo/versionado visible; aprobación institucional antes de activar. |
| **d. Entorno físico** | Detección puntual de intrusiones y objetos configurados como no autorizados. | Activar detección de objetos, tracker consecutivo, política de objetos, persistencia, evidencia y panel. | Detectar persona adicional, teléfono, pantalla adicional y objetos configurables; exigir tres detecciones consecutivas; guardar cantidad, confianza y caja normalizada; no grabar video continuo. |
| **e. Control del dispositivo** | Señales confiables en navegador y bloqueo fuerte mediante SEB cuando el cuestionario lo exige. | Agregar blur/focus, fullscreen, pagehide, salida de página, política de modo y validación de configuración SEB. | `browser` registra señales sin prometer control del sistema operativo; `seb` rechaza configuración inválida; `either` permite ambos modos reales; SEB Windows y macOS validados manualmente. |
| **f. Análisis predictivo** | Riesgo explicable, versionado y actualizado durante el examen. | Implementar ventana móvil de cinco minutos, decaimiento temporal, histórico persistido, idempotencia y actualización en tiempo real. | Puntaje 0–100; factores y pesos visibles; cálculo repetible; reintentos no duplican contribuciones; nunca modifica calificación ni bloquea automáticamente. |
| **g. Conductas configurables** | Reglas declarativas, cerradas, versionadas y limitadas por permisos. | Crear motor de políticas por cuestionario, límites institucionales, permisos y copia inmutable a la sesión. | Solo tipos de señal permitidos; sin JavaScript, SQL ni expresiones arbitrarias; máximo 20 reglas; política congelada al iniciar el intento; aislamiento por curso. |
| **h. Evidencia** | Cada anomalía relevante debe tener evidencia puntual cifrada, auditable y reintentable. | Conectar la tubería de evidencia con a, c y d; completar recuperación ante fallas reales. | JPEG máximo 200 KB; cifrado AES-256-GCM antes de S3/MinIO; bucket privado; cola persistente; vínculo evento–alerta–evidencia; estados `available`, `pending`, `unavailable` o `failed`; revisión humana auditada. |

## Requisitos de producto institucional

### Validación técnica externa

- Ejecutar la matriz real de Chrome y Edge en Windows y macOS.
- Validar Android con Wi-Fi y red móvil.
- Validar iPhone/iPad con Safari.
- Validar SEB Windows y macOS.
- Pasar los dos conjuntos PHPUnit dentro de Moodle.
- Probar contra MariaDB, S3/MinIO y Moodle institucionales.
- Ejecutar carga de 1.000 sesiones con cero fallos terminales, p95 menor a 1.000 ms y menos de 1% de operaciones reintentadas, salvo decisión institucional documentada.

### Calidad de modelos y decisiones

- Medir precisión, recall, falsos positivos y falsos negativos por dispositivo, iluminación y población.
- Probar suplantación, fotografías, videos, múltiples rostros y pérdida de cámara.
- Versionar modelos, umbrales y políticas.
- Mantener todas las alertas sujetas a revisión humana.
- No modificar calificaciones ni sancionar automáticamente por una señal.

### Privacidad y cumplimiento

- Definir base legal, consentimiento informado y aviso al estudiante.
- Completar evaluación de impacto para datos biométricos.
- Definir retención, eliminación, excepciones y solicitudes de acceso.
- Documentar procedimiento de apelación y revisión humana.
- Restringir acceso por curso y capacidad institucional.
- Mantener auditoría de visualización, descarga, eliminación y reinscripción.

### Operación productiva

- Incorporar CI/CD y despliegue reproducible.
- Configurar backups y restauración probada de MariaDB y S3/MinIO.
- Añadir métricas, logs estructurados, trazabilidad y alertas operativas.
- Definir disponibilidad objetivo, SLA, RTO y RPO.
- Probar rotación de secretos y de claves de cifrado sin perder evidencia vigente.
- Preparar respuesta a incidentes y soporte con correlación por sesión.

### Panel y experiencia

- Actualización en vivo de sesiones y alertas.
- Reportes y exportación autorizada.
- Filtros por curso, cuestionario, estado, fecha, riesgo y tipo de señal.
- Trazabilidad completa de alerta, evidencia, revisión y nota.
- Accesibilidad de teclado, lector de pantalla y mensajes de error.
- Mensajes claros para recuperación de cámara, red, permisos y SEB.

## Prioridades de desarrollo

### P0 — Antes de declarar piloto completo

1. Biometría continua.
2. Detección del entorno físico.
3. Reglas configurables.
4. Control SEB y señales completas del navegador.
5. Validación externa de dispositivos, Moodle e infraestructura.
6. Definición institucional de privacidad y revisión humana.

### P1 — Endurecimiento de producto

1. Historial real de perfiles biométricos.
2. Expresiones faciales bajo enfoque técnico, opt-in y validado.
3. Riesgo en tiempo real con ventana y decaimiento.
4. Evidencia integrada con todas las señales.
5. Backups, observabilidad, recuperación y rotación de claves.

### P2 — Escalabilidad y operación institucional

1. CI/CD y despliegue reproducible.
2. SLA, soporte y respuesta a incidentes.
3. Reportes, exportación y actualización en vivo del panel.
4. Accesibilidad y optimización de experiencia.

## Regla para informar el avance

Cuando se pregunte “¿cómo está el desarrollo?”, el reporte debe indicar para cada punto **a–h** si está `No iniciado`, `Parcial`, `Implementado` o `Aceptado`.

`Implementado` requiere código y pruebas automatizadas. `Aceptado` requiere además evidencia de ejecución en el entorno institucional correspondiente.

El sistema solo puede llamarse **producto final** cuando todos los puntos funcionales estén aceptados, todas las validaciones externas estén aprobadas y no existan pendientes P0.

