# Plan de implementación del MVP

## Estado de ejecución

- Fase 0: implementada; falta validación contra la instancia MariaDB de destino.
- Fase 1: implementada; falta ejecutar PHPUnit e instalación en un Moodle 4.3.3 real.
- Fase 2: implementada para sesiones, tokens, estados, eventos y alertas; la auditoría administrativa se completa junto con el panel.
- Fase 3: implementada; falta validación con cámara real en los dispositivos del piloto.
- Fase 4: implementada; falta prueba integrada dentro de una instalación Moodle real.
- Fase 5: implementada; falta validar el proveedor S3 y la política institucional de retención.
- Fase 6: implementada; falta prueba integrada con roles y cursos de un Moodle real.
- Fase 7: automatización y runbooks implementados; falta ejecutar la aceptación institucional en Moodle, SEB, dispositivos reales, MariaDB y S3 de destino.

## Principios no negociables

- Moodle conserva usuarios, cursos, cuestionarios, intentos y calificaciones.
- La plataforma de proctoring usa su propia base de datos y nunca lee tablas de Moodle.
- Moodle se comunica con la API por HTTPS y una clave servidor-a-servidor.
- No se usa Docker; MariaDB, almacenamiento de objetos y la API se despliegan como servicios independientes.
- Las alertas se revisan por personas y nunca modifican calificaciones.
- No se graba vídeo continuo ni se infieren emociones.

## Fase 0 — Base de despliegue y configuración

**Objetivo:** dejar la API independiente preparada para un entorno real.

1. Definir la instancia MariaDB externa y ejecutar la migración de sesiones.
2. Configurar secretos mediante variables de entorno: `DATABASE_URL`, `MOODLE_INTEGRATION_KEY`, `JWT_SECRET` y URLs públicas.
3. Añadir migrador versionado y endpoint de estado que compruebe conectividad con MariaDB.
4. Configurar HTTPS, registros estructurados y rotación de secretos.
5. Documentar instalación de la API y del plugin Moodle.

**Criterio de aceptación:** la API inicia con configuración válida, rechaza configuración incompleta y responde a `/health`.

## Fase 1 — Integración efectiva con intentos de Moodle

**Objetivo:** asociar una sesión remota a cada intento de cuestionario protegido.

1. Crear `quizaccess_proctoring`, separado del plugin local.
2. Agregar configuración por cuestionario: proctoring activado, modalidad permitida, política ante fallos y requisitos SEB.
3. Al iniciar un intento, determinar `browser` o `seb` según la regla nativa `quizaccess_seb` de Moodle.
4. Solicitar la sesión a la API mediante `local_proctoring\api_client`.
5. Guardar en Moodle solo el UUID remoto, caducidad y estado; nunca la clave de integración ni el token de navegador.
6. Entregar la URL de preparación al estudiante y validar que la sesión esté preparada antes de comenzar.
7. Cerrar la sesión remota cuando Moodle finalice o abandone el intento.
8. Añadir pruebas PHPUnit para creación, fallos de API, SEB y políticas de bloqueo.

**Criterio de aceptación:** un cuestionario protegido crea una sesión remota única, enlazada a su intento, sin alterar notas.

## Fase 2 — API de sesiones, tokens y eventos

**Objetivo:** completar el límite de seguridad entre Moodle, navegador y plataforma.

1. Añadir tablas de eventos, alertas y auditoría en la base de proctoring.
2. Implementar autenticación de token de navegador para `POST /v1/sessions/:id/events`.
3. Verificar que el token pertenezca a la misma sesión indicada en la URL.
4. Añadir rutas para activar, preparar, finalizar y consultar el estado de una sesión.
5. Implementar las listas cerradas de eventos y estados mediante los contratos compartidos.
6. Aplicar límites de tamaño, frecuencia y metadatos permitidos para evitar abuso.
7. Añadir tests de autorización, expiración, sesión ajena, validación de payload y persistencia.

**Criterio de aceptación:** el navegador solo puede reportar eventos de su sesión activa; Moodle puede crear sesiones, pero no necesita tokens de panel ni credenciales de almacenamiento.

## Fase 3 — Preparación del estudiante

**Objetivo:** validar condiciones mínimas antes de permitir el examen.

1. Crear la aplicación web externa de estudiante, accesible solo con token temporal.
2. Comprobar compatibilidad, conectividad, cámara y permisos.
3. Integrar `@vladmandic/human` solo en navegador para detectar rostro, cantidad de rostros y encuadre.
4. Requerir exactamente un rostro dentro del encuadre antes de la captura de referencia.
5. Implementar una prueba de vida aleatoria de dos pasos: parpadeo, giro a izquierda o giro a derecha.
6. Detener las pistas de cámara al abandonar la página, terminar o fallar de forma definitiva.
7. Registrar resultados y capturas mínimas requeridas mediante la API.
8. Añadir pruebas unitarias para cámara denegada, ningún rostro, dos rostros, encuadre inválido, éxito y fallo de vida.

**Criterio de aceptación:** Moodle solo recibe confirmación de preparación; los datos biométricos y la evidencia permanecen en la plataforma externa.

## Fase 4 — Monitoreo y alertas revisables

**Objetivo:** registrar incidencias sin sanciones automáticas.

1. Crear un monitor de sesión en el navegador.
2. Detectar interrupción de cámara, ausencia o múltiples rostros, rostro fuera de encuadre, cambios de visibilidad, desconexión y reconexión.
3. Enviar eventos con cola local y reintento al recuperar red.
4. Definir reglas de alerta transparentes y configurables por política de examen.
5. Crear alertas asincrónicas, asociadas a eventos y evidencia; no tocar intentos ni notas de Moodle.
6. Usar una cola externa para procesar clasificación y capturas sin bloquear al estudiante.
7. Añadir pruebas para reconexión, eventos duplicados, orden temporal y ausencia de cambios de calificación.

**Criterio de aceptación:** una interrupción de cámara o red crea evidencia revisable y el intento conserva su calificación original.

## Fase 5 — Evidencia, cifrado y retención

**Objetivo:** conservar solo evidencia necesaria y protegerla.

1. Seleccionar un almacenamiento de objetos compatible con S3, separado de Moodle y MariaDB.
2. Cifrar evidencia en tránsito y en reposo; cifrar descriptores biométricos con claves gestionadas fuera del código.
3. Guardar capturas de identidad, intervalos configurables y alertas; no vídeo continuo.
4. Implementar URLs temporales para lectura, emitidas solo tras autorización.
5. Auditar toda visualización, descarga y eliminación de evidencia.
6. Implementar tareas de retención y eliminación según política institucional.
7. Documentar qué datos se almacenan, quién puede acceder y durante cuánto tiempo.

**Criterio de aceptación:** ningún usuario puede acceder a evidencia sin capacidad explícita y cada acceso queda auditado.

## Fase 6 — Panel de revisión y autorización por curso

**Objetivo:** permitir revisión docente sin filtrar datos entre cursos.

1. Crear token SSO de panel emitido por Moodle, con usuario, capacidades, cursos permitidos y caducidad.
2. Validar el token en la API y guardar la sesión del panel en una cookie HTTP-only segura.
3. Implementar listado de sesiones filtrado en servidor por curso; administradores con capacidad institucional ven el alcance global.
4. Mostrar modalidad, estado, cronología de eventos, alertas y evidencia autorizada.
5. Añadir estados de revisión de alertas y notas del revisor, separados de la calificación Moodle.
6. Mostrar estado vacío cuando un docente no tenga cursos autorizados.
7. Añadir pruebas para dos cursos, docente limitado, administrador institucional y acceso denegado a evidencia.

**Criterio de aceptación:** un docente del curso A nunca recibe datos del curso B, incluso manipulando la interfaz o llamadas HTTP.

## Fase 7 — Calidad, operación y piloto

**Objetivo:** validar el flujo completo antes de uso institucional.

1. Añadir prueba vertical: Moodle crea sesión, estudiante se prepara, reporta evento, se genera alerta y docente autorizado la revisa.
2. Crear datos deterministas de prueba y guías de instalación para Moodle, API, MariaDB y almacenamiento.
3. Ejecutar PHPUnit en Moodle, tests de API y pruebas de navegador en móvil y escritorio.
4. Verificar flujo con SEB nativo de Moodle y flujo móvil sin SEB.
5. Realizar prueba de carga de 1.000 sesiones activas, midiendo latencia de API, cola, reintentos y consumo de red.
6. Probar recuperación ante caída temporal de API, cola, almacenamiento y conectividad del alumno.
7. Preparar guías de soporte, privacidad, retención, rotación de secretos e incidentes.

**Criterio de aceptación:** se completa una prueba de aceptación documentada desde ambas modalidades, sin acceso cruzado, sin calificación automática y con evidencia auditada.

## Orden de ejecución recomendado

1. Fase 0 y Fase 1.
2. Fase 2.
3. Fase 3 y Fase 4.
4. Fase 5 y Fase 6.
5. Fase 7.

La primera entrega utilizable ocurre al terminar la Fase 4. Las Fases 5 a 7 son necesarias antes de un piloto institucional con datos reales.
