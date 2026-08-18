'use client';

import React from 'react';

const labels = {
  blink: 'parpadeo',
  'turn-left': 'giro a la izquierda',
  'turn-right': 'giro a la derecha'
};

export function LivenessCheck({ steps, completedSteps, canComplete, onComplete }) {
  const nextStep = steps[completedSteps];

  if (!nextStep) {
    return null;
  }

  return (
    <section aria-labelledby="liveness-title">
      <h2 id="liveness-title">Liveness check</h2>
      <p>Step {completedSteps + 1} of {steps.length}: {labels[nextStep]}.</p>
      <button type="button" onClick={onComplete} disabled={!canComplete}>
        Completar {labels[nextStep]}
      </button>
    </section>
  );
}
