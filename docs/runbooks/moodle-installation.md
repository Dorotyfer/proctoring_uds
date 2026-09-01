# Instalación en Moodle

## Compatibilidad

- Moodle 4.3.3 o superior
- PHP 8.1 o superior
- Salida HTTPS desde el servidor Moodle hacia la API de proctoring

## Instalación

1. Copie `apps/moodle/local/proctoring` a `<moodle>/local/proctoring`.
2. Copie `apps/moodle/mod/quiz/accessrule/proctoring` a `<moodle>/mod/quiz/accessrule/proctoring`.
3. Acceda a Administración del sitio para ejecutar la actualización de la base de datos.
4. Configure la URL HTTPS de la API, la clave compartida, la URL del panel y el secreto SSO del panel en Administración del sitio > Plugins > Plugins locales > Proctoring.
5. Edite un cuestionario y active `Require proctoring` en las restricciones de acceso.
6. Seleccione la modalidad permitida y la política ante indisponibilidad.

El plugin local debe instalarse antes que la regla del cuestionario. Moodle conserva solo el UUID de la sesión externa, su estado y caducidad. Los tokens de navegador se solicitan al momento de redirigir y no se guardan en Moodle.

El servidor web de Moodle debe permitir `camera` para el origen configurado del panel en su cabecera `Permissions-Policy`. La aplicación externa restringe `frame-ancestors` al valor de `MOODLE_ORIGIN`.

## Flujo

1. Moodle crea el intento.
2. El observador solicita una sesión idempotente a la API independiente.
3. La página del intento redirige al flujo externo con un token de 15 minutos.
4. El flujo externo devuelve al estudiante a un callback Moodle.
5. Moodle consulta el estado remoto servidor-a-servidor y solo habilita el intento si está `active`.
6. Moodle mantiene el monitor externo en un iframe con permiso de cámara.
7. Al entregar o vencer el intento, Moodle cierra la sesión remota.
8. Docentes y administradores abren `Proctoring review` desde Moodle; el enlace SSO solo incluye los cursos y capacidades vigentes.

Una falla al cerrar la sesión queda como `close_failed` y nunca impide la entrega ni cambia la calificación.

## Pruebas

Desde una instalación de desarrollo de Moodle:

```bash
vendor/bin/phpunit --testsuite local_proctoring
vendor/bin/phpunit --testsuite quizaccess_proctoring
```
