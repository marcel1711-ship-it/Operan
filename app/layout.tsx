import './globals.css';
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';

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
      <body className={`${jakarta.className} min-h-screen`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
