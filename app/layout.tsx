import './globals.css';
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import Script from 'next/script';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://operan.io';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: 'OPERAN — Business Operations Platform for Marine Experience Businesses',
  description:
    'Manage bookings, customers, payments, communications, workflows and daily operations from one connected platform built for marine experience businesses.',
  alternates: {
    canonical: APP_URL,
  },
  icons: {
    icon: '/Logo.png',
    apple: '/Logo.png',
  },
  openGraph: {
    title: 'OPERAN — Business Operations Platform for Marine Experience Businesses',
    description:
      'Manage bookings, customers, payments, communications, workflows and daily operations from one connected platform built for marine experience businesses.',
    url: APP_URL,
    siteName: 'OPERAN',
    type: 'website',
    images: [
      {
        url: `${APP_URL}/Logo.png`,
        width: 1024,
        height: 1024,
        alt: 'OPERAN',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'OPERAN — Business Operations Platform for Marine Experience Businesses',
    description:
      'Manage bookings, customers, payments, communications, workflows and daily operations from one connected platform built for marine experience businesses.',
    images: [`${APP_URL}/Logo.png`],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          id="meta-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '932532986577653');
              fbq('track', 'PageView');
            `,
          }}
        />
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src="https://www.facebook.com/tr?id=932532986577653&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>
      </head>
      <body className={`${jakarta.className} min-h-screen`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
