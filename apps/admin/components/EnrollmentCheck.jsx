'use client';

import React from 'react';

export function EnrollmentCheck({ canAnalyze, onAnalyze }) {
  return (
    <section aria-labelledby="enrollment-title">
      <h2 id="enrollment-title">Reference capture</h2>
      <p>Keep exactly one face fully inside the frame.</p>
      <button type="button" onClick={onAnalyze} disabled={!canAnalyze}>
        Analizar encuadre
      </button>
    </section>
  );
}
