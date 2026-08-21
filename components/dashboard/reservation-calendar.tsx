'use client';

import { useState, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getReservationStartDate, getReservationVessel } from '@/lib/reservation-utils';
import type { NormalizedReservation } from '@/lib/reservation-utils';

type ReservationCalendarProps = {
  reservations: NormalizedReservation[];
};

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type TooltipState = {
  r: NormalizedReservation;
  x: number;
  y: number;
} | null;

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function statusLabel(s: string | undefined): { text: string; color: string } {
  switch (s) {
    case 'confirmed': return { text: 'Confirmed', color: 'text-emerald-400' };
    case 'pending': return { text: 'Pending', color: 'text-amber-400' };
    case 'in_progress': return { text: 'In Progress', color: 'text-blue-400' };
    case 'completed': return { text: 'Completed', color: 'text-sky-400' };
    case 'cancelled': case 'no_show': return { text: 'Cancelled', color: 'text-red-400' };
    case 'awaiting_payment': return { text: 'Awaiting Payment', color: 'text-amber-400' };
    default: return { text: s || 'Unknown', color: 'text-muted-foreground' };
  }
}

export function ReservationCalendar({ reservations }: ReservationCalendarProps) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const tooltipTimeout = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const showTooltip = useCallback((r: NormalizedReservation, e: React.MouseEvent) => {
    clearTimeout(tooltipTimeout.current);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setTooltip({ r, x, y });
  }, []);

  const hideTooltip = useCallback(() => {
    tooltipTimeout.current = setTimeout(() => setTooltip(null), 150);
  }, []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const cells: { day: number; currentMonth: boolean }[] = [];
  for (let i = 0; i < startOffset; i++) {
    cells.push({ day: daysInPrev - startOffset + 1 + i, currentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, currentMonth: true });
  }
  while (cells.length < 42) {
    cells.push({
      day: cells.length - startOffset - daysInMonth + 1,
      currentMonth: false,
    });
  }

  function prevMonth() {
    setViewDate(new Date(year, month - 1, 1));
  }
  function nextMonth() {
    setViewDate(new Date(year, month + 1, 1));
  }

  function getResForDay(day: number): NormalizedReservation[] {
    const d = new Date(year, month, day);
    return reservations.filter((r) => {
      const rd = getReservationStartDate(r);
      return rd ? isSameDay(rd, d) : false;
    });
  }

  return (
    <div ref={containerRef} className="relative rounded-2xl border border-border bg-[var(--card-bg)] shadow-card p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Reservations Calendar
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            All confirmed bookings
          </p>
        </div>
        <span className="rounded-full border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/10 px-3 py-1 text-xs font-medium text-[var(--brand-primary)]">
          {MONTH_NAMES[month]} {year}
        </span>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">
          {MONTH_NAMES[month]} {year}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="rounded-md p-1 hover:bg-secondary transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={nextMonth}
            className="rounded-md p-1 hover:bg-secondary transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          const isCurrentMonth = cell.currentMonth;
          const cellDate = new Date(
            year,
            isCurrentMonth ? month : idx < 7 ? month - 1 : month + 1,
            cell.day,
          );
          const isToday = isSameDay(cellDate, today);
          const res = isCurrentMonth ? getResForDay(cell.day) : [];

          return (
            <div
              key={idx}
              className={cn(
                'relative min-h-[68px] border-t border-border p-1',
                !isCurrentMonth && 'opacity-30',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                  isToday
                    ? 'bg-[var(--brand-primary)] text-white font-semibold'
                    : 'text-foreground',
                )}
              >
                {cell.day}
              </span>
              <div className="mt-0.5 space-y-0.5">
                {res.slice(0, 3).map((r) => {
                  const isTT = r.source === 'timetree';
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        'flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-medium truncate cursor-default',
                        isTT
                          ? 'bg-purple-500/15 text-purple-400'
                          : 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]'
                      )}
                      onMouseEnter={(e) => showTooltip(r, e)}
                      onMouseLeave={hideTooltip}
                    >
                      <span className="shrink-0">{isTT ? '📅' : '🚢'}</span>
                      <span className="truncate">
                        {r.client_name}{` · ${getReservationVessel(r) || 'N/A'}`}
                      </span>
                    </div>
                  );
                })}
                {res.length > 3 && (
                  <div className="text-[9px] text-muted-foreground pl-1">
                    +{res.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 w-52 rounded-lg border border-border bg-[var(--card-bg)] p-3 shadow-xl"
          style={{
            left: Math.min(tooltip.x, (containerRef.current?.offsetWidth || 300) - 220),
            top: tooltip.y + 12,
          }}
        >
          {tooltip.r.source === 'timetree' ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-purple-400">External</span>
              </div>
              <p className="text-xs font-semibold text-foreground">{tooltip.r.client_name}</p>
              <div className="space-y-0.5 text-[10px] text-muted-foreground">
                <p>{formatTime(tooltip.r.start_at)} – {formatTime(tooltip.r.end_at)}</p>
                {getReservationVessel(tooltip.r) && <p>Vessel: <span className="text-foreground">{getReservationVessel(tooltip.r)}</span></p>}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">{tooltip.r.client_name}</p>
                <span className={cn('text-[9px] font-semibold', statusLabel(tooltip.r.booking_status).color)}>
                  {statusLabel(tooltip.r.booking_status).text}
                </span>
              </div>
              <div className="space-y-0.5 text-[10px] text-muted-foreground">
                <p>{formatTime(tooltip.r.start_at)} – {formatTime(tooltip.r.end_at)}</p>
                {getReservationVessel(tooltip.r) && <p>Vessel: <span className="text-foreground">{getReservationVessel(tooltip.r)}</span></p>}
                {tooltip.r.guest_count && <p>Guests: <span className="text-foreground">{tooltip.r.guest_count}</span></p>}
                {tooltip.r.total_amount > 0 && <p>Total: <span className="text-foreground">${tooltip.r.total_amount.toLocaleString()}</span></p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
