# Configuración

## Clave de cifrado

En `Administración del sitio > Plugins > Plugins locales > Proctoring`, define
`Clave de cifrado` con una clave Base64 que represente exactamente 32 bytes.
Genera una clave fuera de Moodle y guárdala en un gestor de secretos. Por
ejemplo, con OpenSSL:

```text
openssl rand -base64 32
```

No la pongas en JavaScript, no la envíes al navegador y no la guardes en el
repositorio. Si se pierde, las evidencias y descriptores cifrados existentes no
pueden recuperarse.

## Retención y captura

`Días de retención de evidencias` controla cuándo la tarea programada elimina
los archivos privados expirados. El límite actual por captura JPEG es 200 KB.
`Intervalo de captura de evidencia` define el intervalo recomendado para el
cliente; la política del cuestionario puede limitar qué evidencias se generan.

## Biometría

El `Umbral biométrico` debe estar entre 0 y 1. El navegador envía descriptores,
no la clave del servidor. Moodle cifra el descriptor agregado y conserva
versiones revocables del perfil. La biometría debe activarse únicamente con
consentimiento informado y una política institucional aprobada.

## Operación

Configura el cron de Moodle para ejecutar las tareas del plugin:

- purga diaria de evidencias expiradas;
- revisión de evidencias pendientes cada diez minutos;
- recálculo de riesgo cada quince minutos.

Supervisa el espacio de `moodledata`, el estado del cron y los respaldos. La
revisión de alertas no cambia automáticamente la calificación del intento.
