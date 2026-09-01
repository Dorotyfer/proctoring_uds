'use client';

import { useState } from 'react';

export function BiometricConsent({ onAccept }) {
  const [accepted, setAccepted] = useState(false);

  return (
    <section aria-labelledby="biometric-consent-title">
      <p className="eyebrow">Validación de identidad</p>
      <h1 id="biometric-consent-title">Registro biométrico</h1>
      <p>
        En tu primer examen guardaremos un descriptor facial cifrado para comprobar que la cuenta
        de Moodle sea utilizada por la misma persona en futuros intentos.
      </p>
      <p>
        También tomaremos una foto sosteniendo el documento de identidad junto al rostro. La captura
        se conserva como evidencia de la preparación y solo puede verla personal autorizado.
      </p>
      <label>
        <input type="checkbox" onChange={(event) => setAccepted(event.target.checked)} />
        Acepto el registro y la verificación biométrica para este servicio.
      </label>
      <button className="button" disabled={!accepted} onClick={onAccept} type="button">Continuar</button>
    </section>
  );
}
