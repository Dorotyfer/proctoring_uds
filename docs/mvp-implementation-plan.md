# Plan de implementación del MVP Python

## Estado objetivo

El runtime activo es FastAPI/Python 3.12 con páginas Jinja2 y módulos ES nativos. Moodle permanece en PHP; MariaDB y almacenamiento S3 compatible son dependencias de datos. Toda inferencia ocurre en servidor con YuNet, SFace, FasNet y SSDLite.

## Secuencia

1. Mantener contratos HTTP, migraciones SQL aditivas y plugins Moodle sincronizados.
2. Aprovisionar modelos fuera del repositorio y verificar hashes institucionales.
3. Desplegar API y worker mediante systemd detrás de Apache/TLS.
4. Validar preparación, monitoreo, panel, retención, aislamiento por curso y rollback.
5. Ejecutar pruebas Python, Selenium y Moodle/PHP en el gate integral.
6. Registrar versiones, métricas medidas y aprobación operativa sin inventar resultados.

## Restricciones

- sin inferencia ni almacenamiento biométrico en navegador;
- sin análisis de emociones;
- sin pesos, secretos o caches en Git o entregables;
- sin borrar tablas o migraciones heredadas;
- rollback de código por Git y compatibilidad hacia atrás para base de datos.

Los planes `docs/implementation-plans/point-a` a `point-h` detallan las extensiones y límites vigentes.
