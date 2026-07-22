import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { RootProvider } from 'fumadocs-ui/provider';

import { SiteHeader } from '@/components/site-header';
import { siteDescription, siteKeywords, siteName, siteUrl, socialCard } from '@/lib/seo';
import './global.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  keywords: [...siteKeywords],
  icons: {
    icon: '/drift-mark.svg',
    shortcut: '/drift-mark.svg',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    siteName,
    type: 'website',
    title: siteName,
    description: siteDescription,
    images: [socialCard],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteName,
    description: siteDescription,
    images: [socialCard.url],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider search={{ enabled: false }} theme={{ enabled: false }}>
          <div className="page-shell" id="top">
            <a className="skip-link" href="#main">
              Skip to content
            </a>
            <SiteHeader />
            {children}
          </div>
        </RootProvider>
      </body>
    </html>
  );
}
