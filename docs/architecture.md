# Arquitectura

```text
Moodle
  local/proctoring
    └─ HTTPS + clave de integración ──> API de proctoring independiente
                                      ├─ MariaDB/MySQL propia
                                      └─ almacenamiento S3 compatible
```

Moodle conserva usuarios, cursos, cuestionarios, intentos y calificaciones. La API conserva sesiones, eventos, alertas y evidencia cifrada. No existe acceso directo de la API a la base de datos de Moodle.

La aplicación web externa realiza la detección facial localmente con `@vladmandic/human`. Después de la preparación, Moodle incorpora un iframe que conserva la cámara y el monitor durante el intento. Moodle confirma el estado activo mediante la API antes de mostrar el cuestionario; no confía en parámetros enviados por el navegador.

La captura de referencia se cifra con AES-256-GCM antes de salir hacia el almacenamiento de objetos. MariaDB conserva únicamente metadatos, claves de objeto, IV, etiqueta de autenticación, vencimiento y auditoría. La evidencia se entrega mediante una URL de API de 60 segundos que descifra el objeto autorizado en memoria; el bucket nunca es público.

Moodle firma un token SSO de dos minutos con usuario, capacidades y cursos autorizados. La API lo intercambia por una cookie HTTP-only de 30 minutos. Todas las consultas del panel filtran por `moodle_course_id` en SQL, salvo la capacidad institucional explícita. La capacidad biométrica se verifica por separado.

La clave `MOODLE_INTEGRATION_KEY` solo se configura en el servidor Moodle y en la API. La creación devuelve únicamente la referencia de sesión. Moodle solicita un token de navegador de 15 minutos justo antes de redirigir al alumno y no lo persiste.

La cola del navegador persiste hasta 200 eventos y mantiene una copia en memoria si `localStorage` está temporalmente bloqueado. El cliente conserva el orden y reintenta al recuperar conectividad. Las operaciones S3 realizan tres intentos con espera exponencial acotada antes de devolver el error; no se escribe metadato de evidencia si el objeto no pudo almacenarse.
