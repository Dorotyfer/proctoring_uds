# Diseño: Proctoring nativo para Moodle

## Estado

Propuesta aprobada en conversación para revisión antes de implementar.

## Objetivo

Convertir Proctoring UDS en una solución Moodle-céntrica que ejecute dentro del
mismo servidor de Moodle el almacenamiento, la lógica de sesiones, la captura
de evidencias, la biometría, el monitoreo y la revisión de incidentes.

La solución debe conservar las capacidades actuales y ampliar la cobertura en
las áreas que un navegador permite controlar: autenticación, cámara,
micrófono, prueba de vida, detección facial, ambiente, señales del examen,
evidencias, políticas, auditoría, privacidad y reportes.

El objetivo de superar alternativas comerciales se medirá por una matriz de
capacidades y criterios verificables, no por una afirmación general de
superioridad.

## Alcance funcional

La primera arquitectura debe contemplar:

- activación por cuestionario mediante una regla quizaccess;
- creación, activación, expiración y cierre de sesiones por intento Moodle;
- consentimiento biométrico y captura de documento;
- prueba de vida con retos configurables;
- registro biométrico cifrado y comprobaciones repetidas;
- detección de rostro ausente, múltiples rostros y rostro fuera de cuadro;
- detección de personas, teléfono, laptop, pantalla y documento en el ambiente;
- señales de visibilidad, foco, fullscreen, descarga, red y Safe Exam Browser;
- eventos idempotentes, reintentos y cola local del navegador;
- alertas con severidad, política, estado y nota de revisión;
- capturas JPEG cifradas antes de almacenarlas;
- reportes por curso, cuestionario, intento y usuario autorizado;
- puntuación de riesgo explicable y exportación de reportes;
- retención, eliminación, exportación y auditoría de datos personales;
- configuración de niveles de control por cuestionario.

Las funciones que requieren permisos del sistema operativo no se atribuirán a
Moodle puro. El bloqueo del navegador y la supervisión de aplicaciones podrán
integrarse posteriormente mediante Safe Exam Browser o una extensión opcional.

## Arquitectura objetivo

```text
Moodle
├── local/proctoring
│   ├── dominio y servicios PHP
│   ├── API AJAX de Moodle
│   ├── persistencia y cifrado
│   ├── privacidad, capacidades y auditoría
│   ├── panel de revisión
│   ├── tareas programadas
│   └── AMD JavaScript + modelos de detección
└── mod/quiz/accessrule/proctoring
    └── política y control del acceso al cuestionario
```

No habrá API Node.js, base de datos externa, S3 ni claves de integración entre
servidores en la versión nativa.

El navegador hablará con Moodle mediante funciones AJAX declaradas en
`local/proctoring/db/services.php`. Cada función tendrá una clase en
`local/proctoring/classes/external/` que valide argumentos, contexto, usuario,
intento, sesskey y capacidades antes de invocar los servicios internos.

La detección facial y ambiental continuará ejecutándose localmente en el
navegador. Moodle recibirá únicamente estados, eventos y capturas reducidas
según la política del cuestionario.

## Componentes

### Plugin local

`local_proctoring` será el núcleo del sistema y tendrá estas áreas:

- `classes/domain/`: reglas puras de sesión, política, alertas y riesgo;
- `classes/service/`: casos de uso que coordinan Moodle y el dominio;
- `classes/repository/`: acceso a tablas mediante `$DB` y consultas con
  parámetros;
- `classes/external/`: funciones AJAX para el navegador y el panel;
- `classes/privacy/`: metadata, exportación y eliminación de datos;
- `classes/task/`: retención, reintentos y mantenimiento;
- `classes/event/`: eventos Moodle y trazabilidad;
- `amd/src/`: flujo de preparación, monitor, cola y panel;
- `db/install.xml` y `db/upgrade.php`: esquema y evolución de datos;
- `db/services.php`, `db/tasks.php`, `db/events.php` y `db/access.php`;
- páginas PHP para preparación, monitoreo y revisión;
- almacenamiento privado mediante la File API de Moodle.

### Regla del cuestionario

`quizaccess_proctoring` conservará la integración con el ciclo de `mod_quiz`.
Su responsabilidad será limitada a:

- mostrar y guardar la política del cuestionario;
- impedir el acceso cuando la sesión no esté activa;
- iniciar la preparación del estudiante;
- mantener el monitor dentro del intento;
- cerrar la sesión al finalizar o abandonar el intento.

La regla dependerá del plugin local y no accederá directamente a tablas ajenas
al contrato del servicio de proctoring.

### Cliente del navegador

El cliente AMD reemplazará las páginas Next.js, conservando la lógica útil de
los módulos actuales:

- `PreparationFlow`: consentimiento, cámara, registro y prueba de vida;
- `SessionMonitor`: detección continua, eventos y evidencias;
- `PanelDashboard`: navegación y revisión desde Moodle;
- módulos de cámara, biometría, modelos, señales y buffers locales.

Los modelos se servirán como assets versionados del plugin. No contendrán datos
personales. El cliente nunca recibirá secretos administrativos ni acceso directo
a la base de datos.

## Persistencia

La base de datos de Moodle será la única base de datos. El esquema nativo tendrá
como mínimo tablas para:

- políticas por cuestionario;
- sesiones por intento;
- eventos idempotentes;
- alertas y revisiones;
- evidencias y auditoría de acceso;
- perfiles biométricos, versiones y comprobaciones;
- señales ambientales y de dispositivo;
- puntuaciones y razones de riesgo.

Cada sesión tendrá una relación verificable con `userid`, `courseid`,
`quizid` y `attemptid`. Se impondrán índices y restricciones de unicidad
para evitar dos sesiones activas para el mismo intento y eventos duplicados.

Las evidencias se cifrarán en PHP con AES-256-GCM antes de pasar a la File API.
La clave no se guardará en el código ni en una carpeta pública; se suministrará
desde `config.php` o desde una variable de entorno protegida del servidor. La
descarga pasará por una función autorizada del plugin y nunca expondrá el
archivo privado mediante una URL pública.

## Flujo de sesión

```text
Inicio de intento Moodle
  → evento Moodle crea sesión local
  → página de preparación obtiene estado autorizado
  → estudiante concede cámara y consentimiento
  → navegador ejecuta identidad y prueba de vida
  → Moodle valida y activa la sesión
  → monitor envía eventos, alertas y evidencias
  → Moodle actualiza estado durante el intento
  → entrega o cierre completa la sesión
  → docente revisa alertas y evidencias en Moodle
```

El navegador no podrá activar una sesión usando solo parámetros propios. Moodle
validará siempre la identidad, el intento, el curso, la política y el token de
sesión asociado.

## Contrato AJAX interno

El primer contrato estable tendrá operaciones equivalentes a las actuales:

- `start_attempt_session`;
- `get_attempt_session`;
- `activate_attempt_session`;
- `complete_attempt_session`;
- `record_session_events`;
- `record_incident`;
- `upload_evidence`;
- `record_biometric_check`;
- `get_review_profile`;
- `list_courses`;
- `list_course_attempts`;
- `get_session_detail`;
- `review_alert`;
- `reset_biometric_profile`;
- `get_evidence`.

Las operaciones de estudiante exigirán usuario autenticado, sesskey, sesión
válida y pertenencia al intento. Las operaciones de revisión exigirán la
capacidad correspondiente en el contexto de sistema o curso. Todas las
entradas se limitarán por tamaño, tipo, fecha y estado de sesión.

## Seguridad y privacidad

- HTTPS será obligatorio para cámara, micrófono y activación biométrica.
- Se usarán `require_login()`, `require_sesskey()` y validación de contexto.
- Se comprobará la propiedad del intento en cada operación del estudiante.
- Las consultas usarán placeholders y filtrarán por curso, intento y usuario.
- Las capturas y descriptores biométricos se cifrarán antes de persistirlos.
- La clave de cifrado quedará fuera del repositorio y de la interfaz pública.
- La alerta no cambiará automáticamente la calificación.
- La revisión humana quedará registrada con usuario, fecha, decisión y nota.
- El plugin implementará la Privacy API para metadata, exportación y borrado.
- La retención se aplicará mediante tareas programadas y quedará auditada.
- El consentimiento biométrico se registrará junto con la versión de la política.

## Capacidades fuera del navegador

Moodle puro puede controlar lo que el navegador expone. No puede inspeccionar
de forma fiable otras aplicaciones, procesos o periféricos del sistema
operativo. Esas capacidades se diseñarán como adaptadores opcionales:

- Safe Exam Browser para bloqueo y modo de examen seguro;
- extensión del navegador para pestañas, portapapeles y navegación;
- cliente auxiliar para aplicaciones y dispositivos del sistema;
- segunda cámara mediante sesión emparejada y canal WebRTC;
- supervisión humana mediante una vista de sesión en tiempo real.

Los adaptadores enviarán señales al mismo núcleo Moodle y no crearán una nueva
fuente de verdad para sesiones, alertas o evidencias.

## Fases de implementación

1. **Núcleo nativo:** esquema, servicios PHP, capacidades, configuración y
   ciclo de sesiones.
2. **Regla de examen:** reemplazar la dependencia externa de
   `quizaccess_proctoring` y bloquear correctamente el intento.
3. **Preparación del estudiante:** AMD, cámara, consentimiento, documento y
   prueba de vida.
4. **Monitor continuo:** detección facial, eventos, buffers, incidentes y
   políticas configurables.
5. **Evidencia y biometría:** cifrado, File API, perfiles, comprobaciones y
   retención.
6. **Panel Moodle:** cursos, intentos, detalle, alertas, riesgo, revisiones,
   biometría y exportación.
7. **Cobertura avanzada:** audio, OCR, segunda cámara, Safe Exam Browser,
   extensión opcional y supervisión humana.
8. **Validación institucional:** PHPUnit, Behat, matriz de dispositivos,
   privacidad, carga, recuperación y migración de datos.

Cada fase debe dejar un flujo ejecutable y no romper la instalación externa
existente hasta que la versión nativa sea validada.

## Criterios de aceptación

- Un administrador instala ambos plugins desde una copia limpia de Moodle.
- Un docente configura una política por cuestionario sin URL externa.
- Un estudiante no puede iniciar el cuestionario sin completar la preparación.
- La sesión se relaciona con el intento correcto y no se duplica al recargar.
- Los eventos duplicados no generan registros duplicados.
- Una alerta configurada genera evidencia cifrada cuando corresponde.
- Un docente solo ve cursos y sesiones autorizados.
- Un administrador puede exportar o eliminar los datos de un usuario.
- La limpieza respeta la retención y deja auditoría.
- El sistema funciona con cámara bloqueada, red interrumpida y recarga de página
  según la política configurada.
- PHPUnit y Behat cubren seguridad, ciclo de sesión, privacidad y permisos.
- La validación final se ejecuta en Moodle institucional con HTTPS real.

## Compatibilidad y despliegue

La versión inicial mantendrá la compatibilidad declarada por el proyecto:
Moodle 4.3.3 o superior y PHP 8.1 o superior. El contenido de
`moodle-native/plugins/local/proctoring` se instalará en
`<moodle-root>/local/proctoring`; el contenido de
`moodle-native/plugins/quizaccess/proctoring` se instalará en
`<moodle-root>/mod/quiz/accessrule/proctoring`.

La versión nativa no requerirá Node.js en producción. Node.js podrá seguir
usándose durante el desarrollo para pruebas de JavaScript y empaquetado de
assets, pero Moodle será el único runtime del producto desplegado.
