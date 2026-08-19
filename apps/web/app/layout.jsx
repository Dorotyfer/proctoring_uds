import './styles.css';

export const metadata = {
  title: 'Proctoring UDS',
  description: 'Validación y monitoreo para evaluaciones Moodle'
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
