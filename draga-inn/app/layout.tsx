import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Draga Inn', template: '%s · Draga Inn' },
  description: 'Sistema de Gestión y Gobernanza del Edificio Draga Inn.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Draga Inn' },
  icons: { icon: '/icono.svg', apple: '/icono.svg' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#004225',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-UY">
      <body>
        <a className="salta-al-contenido" href="#contenido">Saltar al contenido</a>
        {children}
      </body>
    </html>
  );
}
