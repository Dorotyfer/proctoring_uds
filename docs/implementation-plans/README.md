# Plan modular de implementación de los puntos a–h

Este directorio contiene ocho planes independientes y un contrato común para implementar los requisitos de supervisión mostrados en la referencia institucional.

## Documentos

| Punto | Documento | Resultado principal |
|---|---|---|
| Común | [shared-contracts.md](./shared-contracts.md) | Eventos, alertas, evidencias, seguridad y pruebas compartidas |
| a | [point-a-biometria-continua.md](./point-a-biometria-continua.md) | Verificación biométrica periódica durante todo el intento |
| b | [point-b-versiones-biometricas.md](./point-b-versiones-biometricas.md) | Una identidad activa por cuenta Moodle y versiones históricas |
| c | [point-c-expresiones-faciales.md](./point-c-expresiones-faciales.md) | Señales persistentes de expresiones faciales, siempre revisables |
| d | [point-d-entorno-fisico.md](./point-d-entorno-fisico.md) | Detección de personas y objetos no autorizados |
| e | [point-e-control-dispositivo.md](./point-e-control-dispositivo.md) | Monitoreo del navegador y SEB opcional por cuestionario |
| f | [point-f-puntuacion-predictiva.md](./point-f-puntuacion-predictiva.md) | Puntuación de riesgo explicable entre 0 y 100 |
| g | [point-g-reglas-institucionales.md](./point-g-reglas-institucionales.md) | Políticas configurables sin código arbitrario |
| h | [point-h-evidencia-anomalias.md](./point-h-evidencia-anomalias.md) | Captura cifrada, reintentos y revisión auditable |

## Decisiones comunes

- Cada documento puede ejecutarse como una entrega independiente y debe terminar con pruebas propias.
- Toda señal se registra como evento idempotente por `sessionId + clientEventId`.
- Las alertas nunca cambian automáticamente la calificación del examen.
- La revisión humana usa internamente `reviewed` y `dismissed`, mostrados al usuario como `Válida` e `Inválida`.
- Las imágenes se limitan a JPEG de 200 KB, se cifran antes de S3/MinIO y nunca se expone directamente el bucket.
- Los descriptores biométricos no se guardan en navegador, logs ni Moodle.
- SEB no es obligatorio globalmente: solo se exige si el cuestionario está configurado en modo `seb`.
- Las pruebas automáticas no dependen de certificados SSL externos. Usarán mocks o servicios locales; las pruebas HTTPS reales quedan como validación manual en el entorno con certificado confiable.

## Orden técnico recomendado

1. Punto h, porque consolida la entrega de evidencias para los demás módulos.
2. Punto b, porque define la identidad biométrica activa y su historial.
3. Punto a, porque consume la versión biométrica activa durante el intento.
4. Punto g, porque formaliza qué señales se habilitan por cuestionario.
5. Punto d, porque agrega detección del entorno físico.
6. Punto c, porque agrega señales de expresiones faciales después de validar sesgos y disponibilidad del modelo.
7. Punto e, porque integra los controles del navegador y la opción SEB.
8. Punto f, porque consume señales de todos los módulos y calcula riesgo agregado.

## Flujo de trabajo por documento

1. Leer `shared-contracts.md` y el documento del punto.
2. Confirmar el estado de las migraciones y del entorno con `pnpm api:infra:check`.
3. Escribir primero las pruebas indicadas en el documento.
4. Implementar el mínimo cambio descrito en sus archivos.
5. Ejecutar las pruebas unitarias y de integración del módulo.
6. Realizar la aceptación manual usando el checklist del documento.
7. Activar el feature flag solo después de verificar almacenamiento, permisos y revisión en el panel.
