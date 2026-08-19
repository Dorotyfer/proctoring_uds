# Aceptación del MVP y piloto

Esta guía registra resultados reales. No marque una fila como aprobada sin adjuntar fecha, versión, dispositivo y evidencia de ejecución.

## Preparación

1. Instale Moodle 4.3.3 o superior, los dos plugins y Safe Exam Browser nativo.
2. Ejecute las migraciones PostgreSQL `001` a `004`.
3. Configure API, aplicación web y bucket S3 privado según `.env.example`.
4. Cree dos cursos (`pilot-course-a` y `pilot-course-b`), un docente limitado a cada curso y un administrador institucional.
5. Genere datos reproducibles con:

```powershell
$env:PILOT_SESSIONS='20'
$env:PILOT_SEED='acceptance-01'
pnpm pilot:fixtures
```

## Verificación automatizada

```powershell
pnpm test
pnpm web:build
```

Desde la raíz de una instalación Moodle:

```bash
vendor/bin/phpunit --testsuite local_proctoring
vendor/bin/phpunit --testsuite quizaccess_proctoring
```

La prueba `pilot-vertical.test.js` cubre creación Moodle, preparación, evento, alerta, aislamiento de curso, evidencia auditada y revisión sin calificación automática.

## Prueba de carga de 1.000 sesiones

Use una semilla nueva en cada ejecución. El comando crea sesiones, solicita tokens, activa las sesiones con evidencia mínima y registra un evento con alerta.

```powershell
$env:PILOT_API_URL='https://api.proctoring.example.edu'
$env:MOODLE_INTEGRATION_KEY='secret-from-secure-store'
$env:PILOT_SESSIONS='1000'
$env:PILOT_CONCURRENCY='50'
$env:PILOT_MAX_RETRIES='2'
$env:PILOT_SEED='load-2026-08-19-01'
pnpm pilot:load
```

Registre `completed`, `failed`, `retries`, `p50`, `p95`, `p99`, `sessionsPerSecond` y `responseMegabytes`. Umbrales iniciales del piloto: 0 fallos terminales, p95 menor a 1.000 ms y menos de 1% de operaciones reintentadas. Ajuste el umbral solo mediante una decisión institucional documentada.

## Matriz de dispositivos

| Flujo | Entorno mínimo | Resultado | Evidencia |
|---|---|---|---|
| Navegador escritorio | Chrome/Edge actual, Windows o macOS, cámara | Pendiente | Captura y versión |
| Android | Chrome actual, cámara frontal, red móvil y Wi-Fi | Pendiente | Modelo, SO y captura |
| iPhone/iPad | Safari actual, cámara frontal | Pendiente | Modelo, iOS y captura |
| SEB Windows | SEB soportado por Moodle, cuestionario con regla nativa | Pendiente | Versión SEB y registro |
| SEB macOS | SEB soportado por Moodle, cuestionario con regla nativa | Pendiente | Versión SEB y registro |

En cada flujo compruebe permiso de cámara, rostro único, encuadre, vida, retorno a Moodle, monitor activo, entrega del intento y cierre remoto. El flujo móvil debe resolver `browser`; el flujo configurado por Moodle con SEB debe resolver `seb`.

## Aislamiento y revisión

1. Genere una alerta en ambos cursos.
2. Ingrese como docente A y confirme que las respuestas HTTP no incluyen sesiones, alertas ni evidencia del curso B.
3. Manipule el UUID de una sesión B y confirme `404`.
4. Confirme `403` al solicitar evidencia sin `local/proctoring:viewbiometricevidence`.
5. Revise una alerta y confirme que la calificación y el intento Moodle no cambian.
6. Ingrese como administrador institucional y confirme el alcance global explícito.

## Recuperación

| Falla inducida | Comportamiento esperado | Resultado |
|---|---|---|
| API temporalmente inaccesible | La cola local conserva eventos y reintenta en orden | Pendiente |
| Red del alumno interrumpida | Se registran desconexión y reconexión; el intento continúa | Pendiente |
| `localStorage` bloqueado | La cola continúa en memoria mientras la página permanezca abierta | Cubierto automáticamente |
| S3 temporalmente inaccesible | La API realiza tres intentos acotados y no crea metadatos huérfanos | Cubierto automáticamente |
| PostgreSQL inaccesible | `/health` devuelve `503` sin revelar credenciales | Cubierto automáticamente |
| Moodle inaccesible al cierre | El estado local queda `close_failed`; la entrega no cambia | Pendiente Moodle |

## Aprobación

El piloto puede aprobarse únicamente cuando todas las filas de dispositivos y fallas externas tengan resultado real, los dos suites PHPUnit pasen y la carga de 1.000 sesiones cumpla los umbrales. Registre responsable, fecha, commit, versiones de Moodle/SEB y enlaces a evidencias.
