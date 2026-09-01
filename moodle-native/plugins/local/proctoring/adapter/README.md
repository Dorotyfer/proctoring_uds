# Adaptadores opcionales

Los adaptadores no crean ni activan sesiones por sí mismos. Una sesión Moodle activa debe existir antes de aceptar sus metadatos.

- `seb.php` valida metadatos y firma de Safe Exam Browser.
- `extension.php` valida una firma y el vínculo con una sesión.
- La segunda cámara y la supervisión en vivo siguen siendo opt-in y usan códigos o señales con expiración.

Si un adaptador no está instalado o no puede validarse, el resultado es `unavailable` y se conserva como señal explícita.
