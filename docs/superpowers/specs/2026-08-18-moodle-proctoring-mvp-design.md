# MVP de proctoring para Moodle 4.3.3

## Objetivo

Construir un sistema de proctoring integrado con Moodle 4.3.3. Un estudiante rinde el cuestionario desde un navegador normal o, opcionalmente, desde Safe Exam Browser (SEB). El sistema recoge controles biométricos y de sesión, genera evidencia revisable y presenta reportes según el alcance académico de cada usuario.

El sistema genera alertas para revisión humana. Nunca modifica automáticamente calificaciones ni aplica sanciones.

## Alcance del MVP

- Plugin local de Moodle para configuración, permisos, comunicación con la plataforma y acceso al panel.
- Integración con la regla nativa de SEB de Moodle; no se instalará ni mantendrá un plugin SEB externo.
- Creación de una sesión de proctoring vinculada a cada intento de cuestionario.
- Aplicación web responsive para la preparación, enrolamiento, prueba de vida y supervisión del estudiante.
- Procesamiento facial local en el navegador para presencia, cantidad de rostros, encuadre y orientación.
- Comparación de identidad al inicio y validaciones seleccionadas por el servidor.
- Eventos de cámara, rostro, foco/visibilidad y conectividad.
- Capturas iniciales, periódicas y asociadas a alertas, sin grabación continua de video.
- API, cola de trabajos, persistencia de sesiones y almacenamiento cifrado de evidencia.
- Panel para docentes y administradores, con alcance de cursos y auditoría de accesos.

## Fuera de alcance

- Navegador seguro propio o bloqueo del sistema operativo desde un navegador normal.
- Obligación de instalar software propio de proctoring.
- Análisis de emociones, detección automática de fraude o sanciones automáticas.
- Video continuo como evidencia predeterminada.
- Acceso directo de la plataforma a la base de datos de Moodle.

## Arquitectura

```text
Moodle 4.3.3
├─ Regla nativa quizaccess_seb (opcional por cuestionario)
└─ Plugin local de proctoring
   ├─ Configuración y capacidades
   ├─ Creación de sesiones desde el servidor Moodle
   └─ Acceso firmado al panel
             │
             ▼
Plataforma de proctoring
├─ API JavaScript: sesiones, eventos, alertas, evidencia y permisos
├─ Cliente web: preparación, cámara y análisis local
├─ Workers JavaScript: validaciones diferidas y alertas
├─ Base de datos MySQL: metadatos operacionales y trabajos asíncronos
├─ Worker local JavaScript: procesa trabajos desde MySQL
└─ Almacenamiento local fuera de Apache: evidencia cifrada
```

Moodle conserva usuarios, cursos, cuestionarios e intentos. La plataforma guarda identificadores Moodle y sus propios datos en MySQL; no consulta las tablas de Moodle. Apache sirve Moodle y las aplicaciones web, pero nunca expone directamente los archivos de evidencia.

## Flujo de sesión

1. El docente configura el cuestionario para requerir proctoring y decide si además exige SEB nativo.
2. Moodle crea una sesión en la API mediante una credencial exclusiva de servidor y la vincula al intento.
3. El estudiante abre el módulo web usando un token de sesión firmado, de corta duración y sin secretos de Moodle.
4. El módulo verifica cámara, conectividad y compatibilidad; solicita permiso de cámara.
5. El estudiante realiza enrolamiento, comprobación de identidad y prueba de vida.
6. Si la política del cuestionario lo permite, Moodle habilita el inicio del intento.
7. Durante el examen, el navegador analiza la cámara y entrega eventos y capturas a la API.
8. Los workers validan las muestras seleccionadas y crean alertas con evidencia mínima.
9. Al finalizar el intento, se cierra la sesión. Docentes y administradores revisan el reporte según sus permisos.

## Controles y evidencia

El cliente web detecta localmente:

- cámara denegada o interrumpida;
- rostro ausente, múltiples rostros, mal encuadre y orientación no permitida;
- resultado de identidad o prueba de vida no válido;
- cambio de visibilidad o foco de página;
- desconexión y reconexión;
- eventos disponibles de SEB cuando el cuestionario lo exige.

La evidencia incluye una captura de referencia, capturas periódicas configurables y capturas motivadas por alertas. No se registra video continuo. Las imágenes y descriptores biométricos se cifran en tránsito y en reposo. El acceso administrativo queda auditado.

## Autorización y privacidad

Moodle emite enlaces o tokens de panel breves con el identificador Moodle, capacidades y cursos autorizados. La API valida el token y aplica el alcance de cursos en cada consulta.

- Docentes: sesiones, alertas y evidencia autorizada de sus cursos.
- Administradores: políticas, retención, auditoría y reportes institucionales.

La interfaz no constituye autorización: el backend aplica permisos y filtros. Los navegadores reciben solo tokens temporales; la credencial de integración Moodle nunca sale del servidor Moodle.

## Fallas

Si no puede crearse una sesión, Moodle bloquea el inicio con un mensaje claro. Durante una sesión, fallas de cámara, red o validación generan un evento y la política del cuestionario determina si se permite continuar, se solicita reintento o se bloquea el comienzo. Ningún evento altera una nota.

El cliente conserva temporalmente eventos pendientes durante cortes breves y los reintenta al reconectarse. El procesamiento de evidencia es asíncrono y no bloquea la entrega del examen.

## Verificación

El MVP debe probar:

- creación de sesiones válidas y rechazo de entradas, claves o tokens inválidos;
- aislamiento estricto de cursos entre docentes;
- flujo de preparación, cámara, identidad y prueba de vida;
- eventos de rostro, cámara, visibilidad y red;
- cifrado, auditoría y autorización de evidencia;
- coexistencia de cuestionarios con navegador normal y con SEB nativo;
- ausencia de cambios automáticos de calificación;
- comportamiento con 1.000 sesiones activas simuladas antes del piloto.

## Criterios de aceptación

- Un administrador configura el plugin y la conexión de Moodle.
- Un docente activa proctoring en un cuestionario de su curso.
- Un estudiante completa la preparación biométrica y rinde desde navegador normal; cuando se exige, puede rendir desde SEB nativo.
- Moodle vincula correctamente la sesión a cada intento.
- El sistema registra controles y evidencia sin almacenar video continuo.
- Docentes ven solo información de sus cursos y administradores ven reportes globales y auditoría.
- Las alertas son revisables y no modifican calificaciones.
