'use client';

import { useState } from 'react';
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

export function ReservationCalendar({ reservations }: ReservationCalendarProps) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );

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
    <div className="rounded-2xl border border-border bg-[var(--card-bg)] shadow-card p-5">
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
                {res.slice(0, 3).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-1 rounded bg-[var(--brand-primary)]/10 px-1 py-0.5 text-[9px] font-medium text-[var(--brand-primary)] truncate"
                  >
                    <span className="shrink-0">🚢</span>
                    <span className="truncate">
                      {r.client_name} · {getReservationVessel(r) || 'N/A'}
                    </span>
                  </div>
                ))}
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
    </div>
  );
}
