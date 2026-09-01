# Diseño: configuración unificada de Proctoring en Moodle

## Estado

Especificación preparada después de la aprobación inicial del objetivo.
Requiere revisión del usuario antes de comenzar la implementación.

## Objetivo

Convertir `local_proctoring` en el único dueño de la configuración, la
ejecución y la revisión de Proctoring dentro de Moodle. La experiencia debe
mostrar una sola configuración llamada **Proctoring**, conservar las funciones
del plugin legado `quizaccess_udsmonitor` y ofrecer un acceso administrativo
desde **Más → Herramientas externas LTI**.

No se utilizará una API Node.js, una base de datos externa ni un secreto de
integración con otro servidor. Moodle será el runtime y la fuente de verdad.

## Alcance funcional

La migración cubre:

- configuración global del sitio;
- configuración específica de cada cuestionario;
- preparación, monitoreo, sesiones, evidencias, biometría y alertas;
- panel de revisión docente/administrativo;
- configuración de Safe Exam Browser y adaptadores opcionales;
- datos y opciones existentes de `quizaccess_udsmonitor`;
- herramienta LTI interna visible en la pantalla de Herramientas externas LTI.

Se conservará el comportamiento actual siempre que el navegador o Moodle
puedan proporcionarlo. Las capacidades que dependen del sistema operativo
seguirán siendo adaptadores opcionales; no se presentarán como control nativo
garantizado del navegador.

## Decisión arquitectónica

`local_proctoring` será el núcleo único:

```text
Administración del sitio
  └── Plugins locales → Proctoring
       ├── General y captura
       ├── Detección de comportamiento y entorno
       ├── Alertas y acciones
       ├── Identidad y biometría
       ├── Riesgo y reglas institucionales
       ├── Evidencias, privacidad y retención
       └── Integración LTI

Configuración del cuestionario
  └── Proctoring
       ├── Activación y modo del dispositivo
       ├── Nivel/perfil y política ante fallos
       ├── Detecciones y umbrales
       ├── Identidad y biometría
       ├── Alertas y acciones
       └── Evidencias y consentimiento

Curso → Más → Herramientas externas LTI
  └── Proctoring
       └── Herramienta LTI interna que abre el panel autorizado
```

La regla `quizaccess_proctoring` seguirá siendo el punto de integración con
`mod_quiz`, pero no será dueña de una segunda política. Leerá y guardará la
política normalizada mediante servicios del plugin local.

## Configuración global unificada

La página de administración conservará el componente
`local_proctoring`, pero ampliará sus grupos visibles. Las claves se
almacenarán bajo `local_proctoring/*` y los valores funcionarán como
predeterminados de los cuestionarios.

### Grupos y opciones

1. **General y captura**
   - habilitación global;
   - intervalo de captura;
   - ancho/calidad y límite de captura;
   - días de retención;
   - clave de cifrado.
2. **Detección de comportamiento y entorno**
   - cambio de pestaña, pérdida de foco y fullscreen;
   - portapapeles, F12, redimensionamiento y descargas;
   - teléfono, voz, mirada, múltiples rostros y rostro ausente;
   - análisis ambiental, emocional y predictivo cuando el modelo esté
     disponible.
3. **Alertas y acciones**
   - máximo de advertencias;
   - acción al alcanzar el máximo;
   - notificación a docentes/revisores;
   - severidad y peso de cada señal.
4. **Identidad y biometría**
   - verificación de identidad;
   - umbral biométrico;
   - autocierre ante fallos;
   - cantidad de fallos consecutivos y segundos de tolerancia;
   - consentimiento y versión de política.
5. **Riesgo y reglas institucionales**
   - perfiles de control bajo/medio/alto;
   - pesos de detección;
   - reglas propias de la institución;
   - configuración compatible con requisitos CONES.
6. **Evidencias, privacidad y retención**
   - tipos de evidencia permitidos;
   - cifrado, auditoría, exportación y eliminación;
   - mensaje de consentimiento;
   - retención por defecto y tareas programadas.
7. **Integración LTI**
   - habilitar/deshabilitar la herramienta;
   - nombre y descripción visibles;
   - disponibilidad en el selector de actividad;
   - registro/revisión de la configuración LTI.

Las opciones globales no expondrán claves privadas al navegador. Las políticas
efectivas se materializarán como una instantánea por intento para que un
cambio posterior de configuración no altere retroactivamente una evaluación.

## Configuración por cuestionario

El formulario de actividad mostrará un único bloque titulado **Proctoring**.
Todos los campos del plugin legado se trasladarán a subgrupos dentro de ese
bloque. El docente podrá usar los valores globales o definir excepciones para
un cuestionario.

La política normalizada tendrá, como mínimo, esta forma conceptual:

```json
{
  "enabled": true,
  "devicepolicy": "either",
  "controllevel": "medium",
  "failurepolicy": "block",
  "capture": {},
  "signals": {},
  "alerts": {},
  "identity": {},
  "risk": {},
  "privacy": {},
  "version": "quiz-policy-1"
}
```

La implementación debe validar cada valor antes de persistirlo. La regla de
acceso consultará una única política efectiva y conservará la política en
`local_proctoring_policy` y en la sesión del intento.

## Migración del plugin legado

El plugin legado detectado en el servidor es `quizaccess_udsmonitor`. Se
mantendrá instalado durante la migración, pero no será una fuente permanente
de configuración.

### Mapeo requerido

El migrador debe contemplar como mínimo:

| Origen legado | Destino unificado |
| --- | --- |
| `keepcapturedays` | `local_proctoring/retentiondays` |
| `maximagekb` | configuración global de captura |
| `defaultidentitythresh` | `local_proctoring/biometricthreshold` |
| `udsm_enabled` | `enabled` de la política del cuestionario |
| `udsm_interval` | `capture.interval` |
| `udsm_imagewidth` | `capture.width` |
| `udsm_tabswitch`, `udsm_fullscreen` | señales de comportamiento |
| `udsm_detectclipboard`, `udsm_detectf12`, `udsm_detectresize` | señales de dispositivo |
| `udsm_maxwarnings`, `udsm_action`, `udsm_notify` | política de alertas |
| `udsm_emotionanalysis`, `udsm_envscanning`, `udsm_predictive` | análisis avanzado |
| `udsm_detectphone`, `udsm_detectvoice`, `udsm_detectgaze` | señales ambientales |
| `udsm_legalevidence` | evidencias y privacidad |
| `udsm_biometricid`, `udsm_identitycheck` | identidad y biometría |
| `udsm_identitythresh`, `udsm_identityautoclose` | umbrales y acción de identidad |
| `udsm_identityautoclosestreak`, `udsm_identityautoclosesecs` | tolerancia de identidad |

El migrador deberá inspeccionar los nombres reales de las columnas y los
registros existentes antes de escribir. No debe asumir que una tabla o una
opción existe. Los valores desconocidos se conservarán en un registro de
migración para revisión manual y no se descartarán silenciosamente.

### Seguridad de la migración

1. Crear respaldo de código y base de datos antes de modificar datos.
2. Ejecutar una previsualización con conteos y diferencias.
3. Importar de forma idempotente, usando una versión de migración.
4. Registrar origen, destino, usuario, fecha, valor transformado y advertencias.
5. Comparar cantidad de cuestionarios y configuraciones migradas.
6. Activar el modo compatibilidad de solo lectura para casos no migrables.
7. Ocultar/deshabilitar el bloque legado solo después de validar la paridad.

No se eliminarán las tablas, archivos ni respaldos del plugin legado en la
primera entrega.

## Herramienta LTI interna

La pantalla de la segunda imagen es la lista estándar de herramientas externas
LTI de Moodle. Para que aparezca una fila como “SMOWL LTI”, Proctoring debe
registrarse como una herramienta LTI de Moodle, no solamente como plugin local.

La implementación agregará un registro de herramienta LTI interno e idempotente
con estas características:

- nombre visible: **Proctoring**;
- descripción institucional configurable;
- lanzamiento a una ruta controlada de `local_proctoring`;
- autenticación y contexto mediante el flujo LTI soportado por Moodle;
- asociación con curso, usuario y capacidades Moodle;
- apertura del panel de revisión para docentes/autorizados;
- apertura del flujo de preparación/monitoreo solo cuando el contexto sea un
  intento válido;
- sin URL de API externa ni secreto enviado al cliente;
- opción para marcarla como visible en el selector de actividad.

El registro se creará o actualizará de forma idempotente. La pantalla de
**Más → Herramientas externas LTI** debe mostrar una sola fila Proctoring y su
contador de uso. La integración LTI no duplicará sesiones, alertas ni
configuraciones; solo será una puerta de entrada al núcleo nativo.

## Panel de revisión

`/local/proctoring/index.php` seguirá siendo el panel único. Debe permitir:

- filtrar por curso, cuestionario, intento, usuario y estado;
- visualizar riesgo, señales, evidencias y advertencias;
- revisar y anotar alertas;
- acceder respetando capacidades y contexto;
- entrar desde el menú normal de Moodle o desde la herramienta LTI;
- no modificar automáticamente la calificación del estudiante.

## Compatibilidad visual y de navegación

- En la configuración del cuestionario solo aparecerá el bloque **Proctoring**.
- El texto legado “UDS Monitor Académico” no aparecerá después de completar la
  migración y activar la compatibilidad de solo lectura.
- En Administración del sitio se verá un único plugin configurable llamado
  **Proctoring**.
- En **Más → Herramientas externas LTI** aparecerá la fila **Proctoring** con
  descripción y estado de disponibilidad.
- El diseño seguirá los componentes y estilos de Moodle, sin introducir una
  aplicación paralela.

## Fases

1. **Contrato y esquema:** ampliar claves, política normalizada y versión de
   migración.
2. **Formulario único:** trasladar todos los campos al bloque Proctoring y
   aplicar valores globales como predeterminados.
3. **Migrador legado:** previsualización, importación idempotente, auditoría y
   compatibilidad de solo lectura.
4. **LTI interno:** registro idempotente, lanzamiento autorizado y enlace al
   panel/flujo correcto.
5. **Retirada visual del legado:** ocultar el formulario antiguo después de
   verificar la paridad.
6. **Pruebas y despliegue:** pruebas unitarias, Behat, validación en una copia
   de Moodle y despliegue con respaldo y purga de cachés.

## Criterios de aceptación

- Existe una sola configuración global visible llamada **Proctoring**.
- Existe un único bloque **Proctoring** en la configuración del cuestionario.
- Todas las opciones identificadas del plugin legado se migran o quedan
  registradas como advertencias explícitas.
- La política efectiva del cuestionario se guarda versionada y se congela por
  intento.
- El plugin legado no duplica campos, sesiones ni alertas.
- **Más → Herramientas externas LTI** muestra una herramienta **Proctoring**.
- La fila LTI abre el panel o el flujo válido según el contexto y respeta
  permisos.
- Un docente puede revisar alertas y evidencias desde Moodle.
- La migración puede ejecutarse nuevamente sin duplicar datos.
- El rollback conserva el respaldo y permite reactivar temporalmente el plugin
  legado.
- La validación termina sin errores HTTP 500 en cursos, actividades, intentos,
  administración y herramientas LTI.
