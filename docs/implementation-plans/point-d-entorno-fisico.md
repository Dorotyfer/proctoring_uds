# Punto D: entorno físico

## Objetivo

Detectar en servidor personas adicionales y objetos restringidos sin conclusiones en el navegador.

## Diseño

SSDLite procesa las capturas de monitoreo. La política inicial considera persona con confianza mínima `0.70` y teléfono, laptop, televisor o libro con confianza mínima `0.60`. Los valores son configuración de política, no métricas de calidad del modelo.

Una alerta requiere tres observaciones concordantes. El navegador solo envía el JPEG y presenta el resultado del servidor. No descarga pesos ni ejecuta detección.

## Gate

Validar clases, umbrales configurados, confirmación triple, falsos positivos y aislamiento por sesión con el modelo aprobado. Publicar únicamente resultados realmente medidos.
