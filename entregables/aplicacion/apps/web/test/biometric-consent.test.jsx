import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { BiometricConsent } from '@/components/BiometricConsent';

it('requires the student to accept the biometric notice before continuing', () => {
  const onAccept = () => {};
  render(<BiometricConsent onAccept={onAccept} />);

  const button = screen.getByRole('button', { name: 'Continuar' });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /acepto/i }));
  expect(button).toBeEnabled();
});
