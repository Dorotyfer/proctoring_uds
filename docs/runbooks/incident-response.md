# Respuesta a incidentes

## Contención

1. Para evidencia expuesta o acceso cruzado, deshabilite el panel y preserve registros; no elimine auditoría.
2. Revoque la credencial afectada y bloquee la identidad S3 comprometida.
3. Si el incidente afecta exámenes activos, mantenga Moodle disponible y aplique la política académica institucional; el proctoring no modifica notas.

## Investigación

Correlacione registros de API, auditoría de evidencia, eventos Moodle y logs del proveedor S3. Determine cursos, usuarios, objetos, acciones y periodo afectados. Las URLs de evidencia caducan en 60 segundos, pero su emisión y descarga deben aparecer en auditoría.

## Recuperación

Rote secretos, restaure acceso mínimo, ejecute la prueba vertical y valide aislamiento entre dos cursos antes de reabrir el panel. Para pérdida de objetos, restaure solo desde una copia autorizada que conserve vencimientos y trazabilidad.

## Comunicación

Notifique por los canales institucionales de privacidad y seguridad. No incluya evidencia biométrica ni secretos en correo, chat o tickets generales. Documente causa, alcance, cronología, decisiones y acciones preventivas.
