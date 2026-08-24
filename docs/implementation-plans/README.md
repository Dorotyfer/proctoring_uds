# Planes de implementación

Estos documentos describen el diseño vigente sobre el runtime FastAPI/Python. Comparten los contratos de `shared-contracts.md` y estas reglas:

- inferencia exclusivamente en servidor;
- YuNet + SFace + FasNet para rostro y prueba de vida;
- SSDLite para personas y objetos;
- confirmación por observaciones múltiples antes de alertar;
- sin emociones ni conclusiones biométricas en navegador;
- migraciones aditivas y rollback de aplicación mediante Git.

| Punto | Alcance |
| --- | --- |
| A | Biometría continua |
| B | Versiones biométricas |
| C | Exclusión de expresiones/emociones |
| D | Entorno físico |
| E | Eventos técnicos de dispositivo |
| F | Límite de puntuación predictiva |
| G | Reglas institucionales |
| H | Evidencia y anomalías |

Los resultados de precisión, latencia y SLA solo se incorporan después de ejecutar el gate con modelos y hardware aprobados.
