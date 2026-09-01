# Instalación

## Requisitos

- Moodle 4.3.3 o superior.
- PHP 8.1 o superior con OpenSSL habilitado.
- HTTPS en el sitio Moodle para cámara, micrófono y biometría.
- Cron de Moodle habilitado.
- File API privado de Moodle operativo y respaldado.

## Copia de plugins

Desde este directorio copia únicamente:

```text
moodle-native/plugins/local/proctoring
  -> <moodle>/local/proctoring

moodle-native/plugins/quizaccess/proctoring
  -> <moodle>/mod/quiz/accessrule/proctoring
```

No copies `tests`, `docs`, `package.json`, `node_modules` ni el directorio
`apps` al servidor Moodle.

Después entra como administrador a `Administración del sitio > Notificaciones`
y completa la actualización. Limpia las cachés desde `Administración del sitio
> Desarrollo > Vaciar todas las cachés`.

## Activación

1. Abre `Administración del sitio > Plugins > Plugins locales > Proctoring`.
2. Define la clave de cifrado y la retención.
3. Edita un cuestionario y activa la regla `Requerir proctoring`.
4. Configura el modo permitido y la política ante fallos.
5. Verifica que el rol docente tenga `local/proctoring:viewowncoursereports` y
   `local/proctoring:reviewowncoursealerts`.

La URL del panel es `/local/proctoring/index.php`. La preparación del intento es
`/mod/quiz/accessrule/proctoring/launch.php?attemptid=<id>`. Ninguna de las dos
redirige a un servicio externo.

## Actualización y reversión

Realiza respaldo de la base de datos y de `moodledata` antes de actualizar.
Conserva la versión anterior del plugin para revertir código, pero no borres
las tablas nativas ni el área privada de evidencias sin ejecutar antes el
procedimiento de privacidad y retención.
