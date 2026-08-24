# Punto B: versiones biométricas

## Objetivo

Permitir renovación controlada de perfiles SFace y auditoría de su ciclo de vida.

## Diseño

Cada perfil incluye usuario Moodle, versión, modelo, estado, fechas y descriptor cifrado. Una restricción transaccional garantiza una sola versión activa. Un reset revoca la activa; una preparación posterior puede crear una versión nueva con consentimiento.

Los descriptores heredados de otra canalización se copian como historia revocada. No se reinterpretan, comparan ni eliminan durante la migración. Las tablas y migraciones históricas permanecen disponibles para auditoría y rollback compatible.

## Gate

Verificar cifrado, exclusión mutua de versión activa, autorización del reset, auditoría y comportamiento ante concurrencia. La compatibilidad se demuestra con datos de prueba; no se asume por similitud de dimensiones.
