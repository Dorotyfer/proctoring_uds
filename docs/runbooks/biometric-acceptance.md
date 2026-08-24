# Aceptación biométrica

## Alcance

La canalización se ejecuta en servidor: YuNet detecta y alinea el rostro, SFace produce el descriptor y FasNet evalúa prueba de vida. El navegador no carga modelos, no calcula descriptores y no decide coincidencias.

## Preparación

- consentimiento explícito registrado;
- desafío emitido por servidor con centro, giro y centro;
- tres JPEG válidos, dentro de límites de tamaño y tiempo;
- decisión basada en la secuencia completa y en umbrales configurados.

## Monitoreo

La identidad continua usa observaciones espaciadas al menos 60 segundos. Una alerta requiere tres observaciones concordantes; errores de red, cámara o calidad se registran como eventos técnicos, no como fraude.

## Versionado

Los perfiles SFace son cifrados y versionados. Solo una versión puede estar activa. Datos biométricos heredados permanecen como historia revocada y no se interpretan con el modelo nuevo.

## Gate de release

La institución debe registrar modelo, versión, hash aprobado, dataset, hardware, umbrales y resultados antes de liberar. No hay hash ni métrica de precisión predeclarados en el repositorio. El análisis de emociones está fuera del producto.
