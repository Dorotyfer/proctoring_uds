# Aceptación biométrica

Use una cuenta Moodle y un curso de prueba. No ejecute esta matriz durante un examen real.

La validación de cámara, certificado TLS y dos personas es manual. No se ejecuta como
prueba automática desde este repositorio, porque depende del dominio público, permisos
del navegador y el certificado instalado en cada equipo. Las pruebas automáticas siguen
usando URLs simuladas y no realizan conexiones externas.

## Orden de ejecución

1. Confirmar API, MariaDB, S3/MinIO, Moodle y frontend disponibles. Verificar que el bucket sea privado y que la API use HTTPS confiable.
2. Iniciar el primer intento del alumno. Aceptar el consentimiento biométrico y completar cámara, rostro único y liveness.
3. Confirmar en MariaDB un perfil único por `moodle_user_id`, con `descriptor_length = 1024` y `descriptor_ciphertext` almacenado como datos cifrados. No registrar ni consultar el descriptor en texto plano.
4. Repetir el intento con el mismo alumno. El resultado esperado es `matched`, sin alerta biométrica.
5. Repetir el intento con otra persona usando la misma cuenta Moodle. El resultado esperado es `mismatch`, una alerta `biometric_mismatch` de severidad `high` y una evidencia `alert` vinculada al mismo `event_id`.
6. Desde el panel, abrir la alerta y la imagen. Marcarla como `Válida`, agregar una nota y confirmar que `status`, `review_note`, `reviewed_by` y `reviewed_at` persisten. Repetir con `Inválida` en otra alerta de prueba.
7. Como gestor institucional, exigir nueva inscripción biométrica. Confirmar estado `revoked`, consentimiento nuevamente solicitado y una nueva `enrollment_version` después del siguiente registro.
8. Repetir una activación y un incidente con la misma solicitud. Confirmar que no se dupliquen perfil, check, evento, alerta ni evidencia.
9. Desconectar la red antes de enviar una incidencia, recargar la página y reconectar. Confirmar que IndexedDB conserva el elemento y que solo se elimina después de una respuesta exitosa.
10. Inducir una falla temporal de S3/MinIO y otra de MariaDB. Confirmar respuestas reintentables, ausencia de metadatos huérfanos y recuperación posterior.

## Evidencia mínima

- Identificador de sesión, intento Moodle, curso y usuario de prueba.
- Estado biométrico antes y después de cada activación.
- `event_id`, `alert_id` y `evidence_id` de la discrepancia.
- Resultado de lectura autorizada de la captura desde el panel.
- Resultado de la revisión y datos de auditoría.
- Estado del perfil antes y después de la revocación.
- Capturas de pantalla del consentimiento, alerta y revisión.

## Criterio de aprobación

La aceptación queda aprobada solo cuando las diez verificaciones tienen evidencia. Las pruebas unitarias y la prueba sintética de servidor no sustituyen la prueba con cámara y dos personas distintas.
