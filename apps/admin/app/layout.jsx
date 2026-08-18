import React from 'react';

export const metadata = {
  title: 'Proctoring preparation'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
