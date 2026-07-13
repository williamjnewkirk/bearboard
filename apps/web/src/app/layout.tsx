import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Bearboard',
  description: 'Team training dashboard for collegiate cross country / track & field',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
