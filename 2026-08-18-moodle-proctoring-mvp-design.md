# Diseño del MVP: Proctoring para Moodle

## Objetivo

Construir un MVP de proctoring integrado con un Moodle autohospedado para evaluar hasta 1.000 estudiantes concurrentes. Debe permitir exámenes desde Windows con Safe Exam Browser (SEB) y desde navegadores móviles, con la misma validez académica y con evidencia apropiada a cada modalidad.

El sistema genera alertas revisables por personas; no califica ni sanciona automáticamente a un estudiante.

## Alcance del MVP

- Plugin instalable en Moodle para asociar proctoring a cuestionarios.
- Regla de acceso al cuestionario que crea y valida una sesión de proctoring.
- Integración obligatoria con SEB en Windows cuando el examen se rinde en equipo de escritorio.
- Módulo web responsive de cámara, enrolamiento, prueba de vida e identificación inicial.
- Detección local de presencia, múltiples rostros, encuadre y orientación facial con `@vladmandic/human`.
- Capturas periódicas y por alerta; no video continuo por defecto.
- API separada para sesiones, eventos, alertas, evidencia y permisos.
- Panel externo para docentes y administradores.
- Control de acceso por capacidades y alcance de curso.
- Auditoría de accesos a evidencia.

## Fuera de alcance del MVP

- Navegador seguro propio.
- Bloqueo total del sistema operativo en dispositivos personales.
- Análisis de emociones como indicio de fraude.
- Sanciones o cambios automáticos de calificación.
- Procesamiento de video continuo para todos los estudiantes.

## Arquitectura

```text
Moodle autohospedado
  ├─ Plugin local: configuración, permisos y acceso al panel
  └─ Plugin quizaccess: regla de inicio/cierre de la sesión
          │
          ▼ API interna autenticada
Plataforma de proctoring
  ├─ Aplicación web Next.js: cámara y panel
  ├─ API Node.js: sesiones, permisos, eventos y alertas
  ├─ Workers CPU: validación de capturas y tareas asíncronas
  ├─ Cola de eventos
  ├─ Base de datos operacional
  └─ Almacenamiento de objetos cifrado para evidencia
```

Moodle conserva usuarios, cursos, cuestionarios e intentos. La plataforma de proctoring conserva sus propios datos y nunca consulta directamente la base de datos de Moodle.

## Modalidades de examen

### Windows seguro

El cuestionario requiere SEB con una configuración autorizada. Moodle valida el cliente y el plugin crea una sesión de proctoring asociada al intento. Esta modalidad aporta eventos de entorno seguro y restricciones de navegación, además de biometría.

### Navegador móvil

El estudiante puede rendir desde navegador móvil. Antes del inicio se comprueba cámara, conectividad, permisos y rendimiento mínimo. Esta modalidad recopila biometría, prueba de vida, presencia, múltiples rostros, orientación y cambios de visibilidad de la página.

Las dos modalidades tienen la misma validez académica. El reporte registra cuál se utilizó, sin convertirla en un indicador negativo. Las capacidades de restricción no son equivalentes: un navegador móvil no puede impedir otras aplicaciones, llamadas o notificaciones de manera confiable.

## Flujo de una sesión

1. El docente configura el cuestionario para requerir proctoring y, si aplica, SEB.
2. El alumno abre el cuestionario desde SEB/Windows o desde un navegador móvil compatible.
3. El plugin solicita a la API una sesión temporal firmada y la vincula al usuario, cuestionario e intento de Moodle.
4. La aplicación web comprueba requisitos, solicita cámara y realiza prueba de vida e identificación inicial.
5. Si la política lo permite, Moodle habilita el inicio del intento.
6. Durante el examen, `@vladmandic/human` procesa la cámara localmente y emite eventos de presencia, múltiples rostros, encuadre y orientación.
7. El cliente envía eventos y capturas programadas o motivadas por alertas a la API.
8. Los workers asíncronos validan capturas, clasifican alertas y guardan evidencia mínima cifrada.
9. Al finalizar el intento, Moodle cierra la sesión y el panel presenta el reporte según los permisos del usuario.

## Biometría y procesamiento

`@vladmandic/human` se ejecuta en el navegador para minimizar carga de servidores. Se utiliza para detectar si hay un rostro, contar rostros, comprobar encuadre y ejecutar retos simples de presencia.

El servidor debe verificar capturas seleccionadas y no confiar exclusivamente en resultados del navegador. El enrolamiento almacena un descriptor biométrico cifrado y solo las imágenes de referencia estrictamente necesarias. Las verificaciones se distribuyen en el tiempo mediante una cola para evitar picos simultáneos.

La primera versión funciona sin GPU: clientes realizan detección ligera y servidores CPU procesan validaciones periódicas y alertas. Una GPU es una optimización futura, no un requisito del piloto.

## Eventos y evidencia

Eventos iniciales:

- cámara denegada o interrumpida;
- ausencia de rostro;
- múltiples rostros;
- rostro fuera de encuadre;
- validación de identidad fallida;
- fallo de prueba de vida;
- cambio de visibilidad/foco;
- desconexión y reconexión;
- evento de SEB cuando corresponda.

Las capturas se realizan en identidad inicial, intervalos configurables y ante alertas. No se almacena video continuo por defecto. Toda evidencia se cifra en tránsito y en reposo, y el acceso queda auditado.

## Roles y permisos

Las capacidades se definen en el plugin Moodle y se validan también en el backend de proctoring.

| Rol | Alcance |
| --- | --- |
| Docente | Sesiones, alertas y reportes de los cursos donde posee la capacidad. |
| Administrador | Configuración institucional, reportes globales, auditoría, retención y excepciones. |
| Coordinador (opcional) | Cursos o unidades organizativas asignadas. |

Capacidades iniciales: `view_own_course_reports`, `review_own_course_alerts`, `view_institution_reports`, `manage_policies` y `view_biometric_evidence`.

El acceso al panel externo se realiza mediante un enlace/token firmado, de corta duración, emitido desde Moodle. El backend aplica el alcance de curso a cada consulta; la interfaz no es el único mecanismo de autorización.

## Fallas y políticas

Ante cámara, red o validación fallida, el sistema registra el incidente y aplica una política por examen: permitir continuar con alerta, pedir reintento o impedir el inicio. No genera sanciones automáticas.

El cliente conserva eventos pendientes durante desconexiones breves y los reintenta al recuperar conectividad. Moodle no espera el procesamiento de IA: las capturas y alertas se procesan asíncronamente.

## Escalabilidad

El diseño objetivo soporta 1.000 sesiones activas. API y workers son stateless y escalables horizontalmente. Una cola desacopla el examen de la validación biométrica. La evidencia se guarda en almacenamiento de objetos cifrado, separado de la base de datos operacional. Los reportes usan lecturas separadas para no afectar sesiones activas.

Se realizarán pruebas de carga con 1.000 sesiones simuladas, medición de latencia, recuperación ante caídas, consumo de red y tasa de falsos positivos antes del piloto institucional.

## Criterios de aceptación del piloto

- Un administrador instala y configura el plugin en Moodle.
- Un docente habilita proctoring en un cuestionario de su curso.
- Un estudiante puede completar el flujo desde SEB/Windows y desde un navegador móvil compatible.
- Moodle vincula correctamente la sesión de proctoring a cada intento.
- El sistema registra eventos y muestra reportes aislados por curso para docentes.
- Un administrador ve auditoría y reportes globales.
- Una interrupción de cámara o red genera una alerta sin modificar automáticamente la calificación.
- La prueba de carga documenta comportamiento con 1.000 sesiones concurrentes.
