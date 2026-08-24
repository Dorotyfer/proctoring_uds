# Punto A: biometría continua

## Objetivo

Confirmar durante el intento que el rostro observado sigue correspondiendo al perfil activo sin trasladar inferencia al navegador.

## Diseño

El navegador captura una imagen según el intervalo indicado por el servidor. FastAPI almacena el trabajo y el worker aplica YuNet y SFace. Las observaciones de identidad se espacian al menos 60 segundos y una alerta requiere tres observaciones concordantes. El servidor puede recomendar un seguimiento a 2 segundos para confirmar una anomalía puntual, sin convertirlo en el intervalo biométrico normal.

Ante `429` u offline, el navegador mantiene solo el JPEG pendiente más reciente en memoria. IndexedDB conserva únicamente eventos técnicos JSON. Las interrupciones de cámara y calidad insuficiente no producen una conclusión local.

## Gate

Validar intervalos, idempotencia, tres observaciones, aislamiento por sesión y recuperación offline con modelos/hardware aprobados. Registrar métricas medidas, no estimadas.
