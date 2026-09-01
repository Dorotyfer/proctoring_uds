# Privacidad y tratamiento de datos

El plugin registra el intento, la sesión, señales técnicas, alertas, metadatos
de evidencia y, si la institución lo activa, un descriptor biométrico cifrado.
Las imágenes se almacenan cifradas en el File API privado de Moodle; no se
guardan en una URL pública ni en un almacenamiento externo.

La Privacy API cubre los contextos de curso y sistema, exporta los registros
asociados al usuario y elimina sesiones, alertas, eventos, metadatos, archivos y
versiones biométricas sin borrar intentos ni calificaciones de Moodle.

El acceso a una evidencia exige sesión Moodle, contexto autorizado y capacidad
correspondiente. Cada acceso y revisión genera auditoría/evento sin registrar
imágenes sin cifrar ni descriptores en los logs.

Antes de producción, la institución debe definir finalidad, base legal,
retención, responsables, proceso de revisión humana y atención de solicitudes
de titulares. La biometría y la identificación documental pueden estar sujetas
a requisitos legales adicionales.
