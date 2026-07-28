import type { Metadata, Viewport } from 'next';
import './globals.css';
import ConvexClientProvider from './ConvexClientProvider';

export const metadata: Metadata = {
  title: 'Shiftlog',
  description: 'Personal part-time hours & timesheet tracker',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Shiftlog',
  },
};

export const viewport: Viewport = {
  themeColor: '#3B5BDB',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
