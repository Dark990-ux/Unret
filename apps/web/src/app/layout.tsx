import type { Metadata, Viewport } from 'next';
import { Footer, SiteHeader } from '@/components/shell';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'UNRET — Find trusted professionals', template: '%s · UNRET' },
  description: 'UNRET connects customers with independent professionals and service companies. Post a request, compare offers, hire with confidence.',
  manifest: '/manifest.webmanifest',
  applicationName: 'UNRET',
};

export const viewport: Viewport = { themeColor: '#047860', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body className="flex min-h-screen flex-col">
        <Providers>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">Skip to content</a>
          <SiteHeader />
          <main id="main" className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
