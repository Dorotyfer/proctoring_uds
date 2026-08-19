# Arquitectura

```text
Moodle
  local/proctoring
    └─ HTTPS + clave de integración ──> API de proctoring independiente
                                             └─ PostgreSQL propia
```

Moodle conserva usuarios, cursos, cuestionarios, intentos y calificaciones. La API conserva únicamente sesiones de proctoring y, en siguientes iteraciones, eventos, alertas y evidencia. No existe acceso directo de la API a la base de datos de Moodle.

La clave `MOODLE_INTEGRATION_KEY` solo se configura en el servidor Moodle y en la API. La creación devuelve únicamente la referencia de sesión. Moodle solicita un token de navegador de 15 minutos justo antes de redirigir al alumno y no lo persiste.
