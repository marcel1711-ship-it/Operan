'use client';

import { cn } from '@/lib/utils';
import { getReservationStartDate, getReservationVessel } from '@/lib/reservation-utils';
import type { BookingStatus } from '@/lib/types';
import type { NormalizedReservation } from '@/lib/reservation-utils';
import { Badge } from '@/components/ui/badge';

type UpcomingChartersProps = {
  reservations: NormalizedReservation[];
};

function formatChartDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatChartTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function statusBadge(status: string | undefined) {
  switch (status as BookingStatus | undefined) {
    case 'completed':
      return <Badge variant="info">Completed</Badge>;
    case 'cancelled':
    case 'no_show':
      return <Badge variant="destructive">Cancelled</Badge>;
    case 'in_progress':
      return <Badge variant="default">In Progress</Badge>;
    case 'awaiting_payment':
      return <Badge variant="warning">Awaiting Payment</Badge>;
    case 'pending':
      return <Badge variant="warning">Pending</Badge>;
    case 'confirmed':
    default:
      return <Badge variant="success">Confirmed</Badge>;
  }
}

export function UpcomingCharters({ reservations }: UpcomingChartersProps) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const upcoming: { r: NormalizedReservation; date: Date }[] = reservations
    .map((r) => ({ r, date: getReservationStartDate(r) }))
    .filter(
      (x): x is { r: NormalizedReservation; date: Date } =>
        x.date !== null && x.date >= now && x.date <= cutoff,
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-[var(--card-bg)] p-6 shadow-card">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Upcoming Charters
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Next 30 days</p>
        </div>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-secondary text-xs font-semibold text-foreground">
          {upcoming.length}
        </span>
      </div>

      {upcoming.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-12 text-muted-foreground">
          <p className="text-sm">No upcoming charters</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 text-left text-2xs font-semibold uppercase tracking-wider text-muted-foreground pr-4">
                  Date
                </th>
                <th className="pb-2 text-left text-2xs font-semibold uppercase tracking-wider text-muted-foreground pr-4">
                  Client
                </th>
                <th className="pb-2 text-left text-2xs font-semibold uppercase tracking-wider text-muted-foreground pr-4">
                  Vessel
                </th>
                <th className="pb-2 text-right text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map(({ r, date }) => {
                const endIso = r.end_at || (r as Record<string, unknown>).charter_end as string | null;
                const end = endIso
                  ? new Date(endIso)
                  : new Date(date.getTime() + 4 * 60 * 60 * 1000);

                return (
                  <tr
                    key={r.id}
                    className="border-b border-border/50 transition-colors last:border-0 hover:bg-secondary/30"
                  >
                    <td className="py-3 pr-4 text-xs text-muted-foreground align-top whitespace-nowrap">
                      <span className="font-medium text-foreground">
                        {formatChartTime(date)}
                      </span>
                      <span className="mx-1 text-muted-foreground">–</span>
                      <span>{formatChartTime(end)}</span>
                      <br />
                      <span className="text-2xs text-muted-foreground">
                        {formatChartDate(date)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-xs font-medium text-foreground align-top">
                      {r.client_name}
                    </td>
                    <td className="py-3 pr-4 align-top">
                      <span className="text-xs font-medium text-[var(--brand-primary)]">
                        {getReservationVessel(r) || '—'}
                      </span>
                    </td>
                    <td className="py-3 text-right align-top">
                      {statusBadge(r.booking_status)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
