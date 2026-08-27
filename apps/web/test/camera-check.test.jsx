import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { CameraCheck } from '@/components/CameraCheck';

it('shows a clear error when camera permission is denied', async () => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) }
  });
  render(<CameraCheck onReady={vi.fn()} totalSteps={4} />);
  expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Permitir cámara' }));

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('obligatorio'));
});
