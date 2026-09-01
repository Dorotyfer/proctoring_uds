import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { IdentityDocumentCapture } from '@/components/IdentityDocumentCapture';
import { captureReference } from '@/lib/camera';

vi.mock('@/lib/camera', () => ({
  captureReference: vi.fn()
}));

const jpeg = 'data:image/jpeg;base64,/9j/2Q==';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

it('lets the student preview, repeat and confirm the document photo', () => {
  const onConfirm = vi.fn();
  const stream = { id: 'camera-stream' };
  captureReference.mockReturnValue(jpeg);

  const { container } = render(<IdentityDocumentCapture onConfirm={onConfirm} stream={stream} />);

  expect(screen.getByText('Paso 4 de 4')).toBeInTheDocument();
  expect(container.querySelector('video').srcObject).toBe(stream);
  fireEvent.click(screen.getByRole('button', { name: 'Tomar foto' }));
  expect(screen.getByRole('img', { name: 'Vista previa con el documento de identidad' })).toHaveAttribute('src', jpeg);

  fireEvent.click(screen.getByRole('button', { name: 'Repetir' }));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(container.querySelector('video').srcObject).toBe(stream);

  fireEvent.click(screen.getByRole('button', { name: 'Tomar foto' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
  expect(onConfirm).toHaveBeenCalledWith(jpeg);
});

it('keeps the capture step available when a valid JPEG cannot be produced', () => {
  captureReference.mockReturnValue(null);

  render(<IdentityDocumentCapture onConfirm={vi.fn()} stream={{ id: 'camera-stream' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Tomar foto' }));

  expect(screen.getByRole('alert')).toHaveTextContent('No se pudo generar una foto válida');
  expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeEnabled();
});
