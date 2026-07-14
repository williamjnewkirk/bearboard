import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata = {
  title: 'BearBoard',
  description: 'Team training dashboard for collegiate cross country / track & field',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#971B2F', // brand maroon; keep in sync with tailwind.config.ts
          colorDanger: '#BA0C2F', // brand crimson
        },
      }}
    >
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
