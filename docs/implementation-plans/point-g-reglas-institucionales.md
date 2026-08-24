# Punto G: reglas institucionales

## Objetivo

Aplicar políticas por institución y curso mediante datos validados, sin código arbitrario.

## Diseño

Las reglas usan un esquema allowlist versionado: intervalos, umbrales admitidos, clases de objetos, retención y acciones de revisión. FastAPI valida tipo, rango y permisos antes de activarlas. La política efectiva queda asociada a la sesión para auditoría.

Una configuración inválida falla de forma cerrada para nuevas activaciones y conserva la última política válida. No evalúa expresiones, scripts, plantillas ejecutables ni instrucciones suministradas por usuarios.

## Gate

Probar autorización, aislamiento por curso, rangos, versionado, fallback y trazabilidad. Los cambios sensibles requieren aprobación y quedan auditados.
