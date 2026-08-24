# Punto E: control del dispositivo

## Objetivo

Registrar señales técnicas verificables del navegador y Safe Exam Browser (SEB) sin convertirlas en inferencias biométricas.

## Diseño

Módulos ES nativos generan UUID idempotentes para cambios de red, visibilidad, interrupción de cámara y señales SEB permitidas. La cola IndexedDB es acotada, reintenta al recuperar conexión y contiene solo JSON estructurado. No admite imágenes, base64, tokens, descriptores o decisiones locales.

El servidor valida esquema, pertenencia a sesión, tamaño y duplicados. La ausencia de una señal o una incompatibilidad se registra como estado técnico, no como fraude automático.

## Gate

Probar límites, reintentos, idempotencia, limpieza, accesibilidad de estados y que ninguna ruta de almacenamiento web reciba datos biométricos.
