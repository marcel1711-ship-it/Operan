'use client';

import { useMemo } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Anchor, Users, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NormalizedReservation } from '@/lib/reservation-utils';
import type { Customer } from '@/lib/types';

type AnalyticsViewProps = {
  reservations: NormalizedReservation[];
  customers: Customer[];
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatCurrency(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toLocaleString()}`;
}

export function AnalyticsView({ reservations, customers }: AnalyticsViewProps) {
  const analytics = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const revenueByMonth: number[] = Array(12).fill(0);
    const bookingsByMonth: number[] = Array(12).fill(0);
    const listingRevenue: Record<string, { name: string; revenue: number; bookings: number }> = {};

    let thisMonthRevenue = 0;
    let lastMonthRevenue = 0;
    let thisMonthBookings = 0;
    let lastMonthBookings = 0;
    let totalRevenue = 0;

    const operanReservations = reservations.filter((r) => r.source !== 'timetree');

    for (const r of operanReservations) {
      const d = r.start_at ? new Date(r.start_at) : null;
      if (!d || d.getFullYear() !== thisYear) continue;

      const month = d.getMonth();
      const amount = r.total_amount || 0;

      revenueByMonth[month] += amount;
      bookingsByMonth[month]++;
      totalRevenue += amount;

      if (month === thisMonth) {
        thisMonthRevenue += amount;
        thisMonthBookings++;
      }
      if (month === thisMonth - 1 || (thisMonth === 0 && month === 11)) {
        lastMonthRevenue += amount;
        lastMonthBookings++;
      }

      const listingName = (r as Record<string, unknown>).listing_name as string || r.vessel || 'Unknown';
      const listingId = (r as Record<string, unknown>).listing_id as string || listingName;
      if (!listingRevenue[listingId]) {
        listingRevenue[listingId] = { name: listingName, revenue: 0, bookings: 0 };
      }
      listingRevenue[listingId].revenue += amount;
      listingRevenue[listingId].bookings++;
    }

    const revenueTrend = lastMonthRevenue > 0
      ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      : 0;
    const bookingsTrend = lastMonthBookings > 0
      ? Math.round(((thisMonthBookings - lastMonthBookings) / lastMonthBookings) * 100)
      : 0;

    const topListings = Object.values(listingRevenue)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const maxRevenue = Math.max(...revenueByMonth, 1);
    const maxBookings = Math.max(...bookingsByMonth, 1);

    const avgBookingValue = thisMonthBookings > 0 ? thisMonthRevenue / thisMonthBookings : 0;

    const newCustomersThisMonth = customers.filter((c) => {
      const d = c.created_at ? new Date(c.created_at) : null;
      return d && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;

    return {
      revenueByMonth, bookingsByMonth, maxRevenue, maxBookings,
      thisMonthRevenue, lastMonthRevenue, revenueTrend,
      thisMonthBookings, lastMonthBookings, bookingsTrend,
      totalRevenue, topListings, avgBookingValue, newCustomersThisMonth,
      thisMonth, thisYear,
    };
  }, [reservations, customers]);

  return (
    <div className="animate-fade-in space-y-6">
      {/* KPI Summary Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Revenue This Month"
          value={formatCurrency(analytics.thisMonthRevenue)}
          trend={analytics.revenueTrend}
          icon={DollarSign}
          sub={`vs ${formatCurrency(analytics.lastMonthRevenue)} last month`}
        />
        <KpiCard
          label="Bookings This Month"
          value={String(analytics.thisMonthBookings)}
          trend={analytics.bookingsTrend}
          icon={Anchor}
          sub={`vs ${analytics.lastMonthBookings} last month`}
        />
        <KpiCard
          label="Avg Booking Value"
          value={formatCurrency(analytics.avgBookingValue)}
          icon={TrendingUp}
          sub="Per reservation"
        />
        <KpiCard
          label="New Customers"
          value={String(analytics.newCustomersThisMonth)}
          icon={Users}
          sub={`${customers.length} total`}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue Chart */}
        <div className="rounded-2xl border border-border bg-[var(--card-bg)] p-6 shadow-card">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Revenue</h3>
              <p className="text-xs text-muted-foreground">{analytics.thisYear} monthly breakdown</p>
            </div>
            <span className="text-lg font-bold text-foreground">{formatCurrency(analytics.totalRevenue)}</span>
          </div>
          <div className="flex items-end gap-1.5" style={{ height: 160 }}>
            {analytics.revenueByMonth.map((val, i) => {
              const height = analytics.maxRevenue > 0 ? (val / analytics.maxRevenue) * 140 : 0;
              const isCurrent = i === analytics.thisMonth;
              return (
                <div key={i} className="group relative flex flex-1 flex-col items-center">
                  <div
                    className={cn(
                      'w-full rounded-t-md transition-all duration-500',
                      isCurrent ? 'bg-[var(--brand-primary)]' : 'bg-[var(--brand-primary)]/20',
                      'group-hover:bg-[var(--brand-primary)]/60'
                    )}
                    style={{ height: Math.max(height, 2) }}
                  />
                  <span className="mt-1.5 text-[9px] text-muted-foreground">{MONTH_LABELS[i]}</span>
                  {val > 0 && (
                    <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[9px] font-medium text-background opacity-0 transition-opacity group-hover:opacity-100">
                      {formatCurrency(val)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bookings Chart */}
        <div className="rounded-2xl border border-border bg-[var(--card-bg)] p-6 shadow-card">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Bookings</h3>
              <p className="text-xs text-muted-foreground">{analytics.thisYear} monthly breakdown</p>
            </div>
            <span className="text-lg font-bold text-foreground">
              {analytics.bookingsByMonth.reduce((a, b) => a + b, 0)} total
            </span>
          </div>
          <div className="flex items-end gap-1.5" style={{ height: 160 }}>
            {analytics.bookingsByMonth.map((val, i) => {
              const height = analytics.maxBookings > 0 ? (val / analytics.maxBookings) * 140 : 0;
              const isCurrent = i === analytics.thisMonth;
              return (
                <div key={i} className="group relative flex flex-1 flex-col items-center">
                  <div
                    className={cn(
                      'w-full rounded-t-md transition-all duration-500',
                      isCurrent ? 'bg-emerald-500' : 'bg-emerald-500/20',
                      'group-hover:bg-emerald-500/60'
                    )}
                    style={{ height: Math.max(height, 2) }}
                  />
                  <span className="mt-1.5 text-[9px] text-muted-foreground">{MONTH_LABELS[i]}</span>
                  {val > 0 && (
                    <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[9px] font-medium text-background opacity-0 transition-opacity group-hover:opacity-100">
                      {val} bookings
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Listings */}
      <div className="rounded-2xl border border-border bg-[var(--card-bg)] p-6 shadow-card">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">Top Experiences</h3>
          <p className="text-xs text-muted-foreground">By revenue this year</p>
        </div>
        {analytics.topListings.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No booking data yet</p>
        ) : (
          <div className="space-y-3">
            {analytics.topListings.map((listing, i) => {
              const maxListingRevenue = analytics.topListings[0]?.revenue || 1;
              const pct = (listing.revenue / maxListingRevenue) * 100;
              return (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{listing.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{listing.bookings} bookings</span>
                      <span className="text-sm font-semibold text-foreground">{formatCurrency(listing.revenue)}</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-secondary">
                    <div
                      className="h-2 rounded-full bg-[var(--brand-primary)] transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, trend, icon: Icon, sub }: {
  label: string;
  value: string;
  trend?: number;
  icon: typeof DollarSign;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-[var(--card-bg)] p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-primary)]/10">
          <Icon className="h-5 w-5 text-[var(--brand-primary)]" />
        </div>
        {trend !== undefined && trend !== 0 && (
          <div className={cn(
            'flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold',
            trend > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
          )}>
            {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
