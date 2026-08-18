import type { Metadata } from 'next';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://operan.io';

export const metadata: Metadata = {
  title: 'See OPERAN in Action | OPERAN',
  description:
    'See how OPERAN can fit your charter operation, from bookings and fleet availability to payments, communication and day-to-day workflows.',
  alternates: {
    canonical: `${APP_URL}/demo`,
  },
  openGraph: {
    title: 'See OPERAN in Action | OPERAN',
    description:
      'See how OPERAN can fit your charter operation, from bookings and fleet availability to payments, communication and day-to-day workflows.',
    url: `${APP_URL}/demo`,
    siteName: 'OPERAN',
    type: 'website',
  },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
