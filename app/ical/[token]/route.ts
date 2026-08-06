import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const { token } = params;

  const { data: feed } = await supabaseAdmin
    .from('tenant_ical_feeds')
    .select('id, tenant_id, name, include_cancelled, include_customer_info, selected_listing_ids')
    .eq('feed_token', token)
    .eq('feed_type', 'export')
    .eq('status', 'active')
    .maybeSingle();

  if (!feed) {
    return new NextResponse('Feed not found', { status: 404 });
  }

  let query = supabaseAdmin
    .from('reservations')
    .select(`
      id, booking_reference, status, start_date, end_date,
      customer_id, customers(full_name),
      listing_id, listings(name),
      total_amount, currency
    `)
    .eq('tenant_id', feed.tenant_id)
    .in('status', ['confirmed', 'pending', 'cancelled']);

  if (feed.selected_listing_ids && feed.selected_listing_ids.length > 0) {
    query = query.in('listing_id', feed.selected_listing_ids);
  }

  if (!feed.include_cancelled) {
    query = query.neq('status', 'cancelled');
  }

  const { data: reservations } = await query;

  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  let ical = 'BEGIN:VCALENDAR\r\n';
  ical += 'VERSION:2.0\r\n';
  ical += 'PRODID:-//OPERAN//Reservation Export//EN\r\n';
  ical += 'CALSCALE:GREGORIAN\r\n';
  ical += `X-WR-CALNAME:${escapeIcal(feed.name)}\r\n`;

  for (const r of (reservations || [])) {
    const startDate = r.start_date ? r.start_date.replace(/-/g, '') : '';
    const endDate = r.end_date ? new Date(new Date(r.end_date).getTime() + 86400000).toISOString().split('T')[0].replace(/-/g, '') : '';
    const customerName = (r.customers as { full_name?: string })?.full_name || 'Guest';
    const listingName = (r.listings as { name?: string })?.name || 'Booking';

    let summary = `Booking: ${listingName}`;
    if (feed.include_customer_info) {
      summary = `Booking: ${customerName} - ${listingName}`;
    }

    const status = r.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED';

    ical += 'BEGIN:VEVENT\r\n';
    ical += `UID:${r.id}@operan.app\r\n`;
    ical += `DTSTAMP:${now}\r\n`;
    ical += `DTSTART;VALUE=DATE:${startDate}\r\n`;
    ical += `DTEND;VALUE=DATE:${endDate}\r\n`;
    ical += `SUMMARY:${escapeIcal(summary)}\r\n`;
    ical += `STATUS:${status}\r\n`;
    if (feed.include_customer_info) {
      ical += `DESCRIPTION:${escapeIcal(`Booking ref: ${r.booking_reference}\\nCustomer: ${customerName}\\nListing: ${listingName}`)}\r\n`;
    } else {
      ical += `DESCRIPTION:${escapeIcal(`Booking ref: ${r.booking_reference}`)}\r\n`;
    }
    ical += 'END:VEVENT\r\n';
  }

  ical += 'END:VCALENDAR\r\n';

  return new NextResponse(ical, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${feed.name.replace(/[^a-zA-Z0-9]/g, '_')}.ics"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

function escapeIcal(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}
