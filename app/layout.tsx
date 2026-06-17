import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Monitor de Estrés del Sistema',
  description: 'Actividad de Sistemas Operativos - Monitoreo de CPU y BD',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className={`${inter.className} bg-gray-900 text-gray-100 min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
