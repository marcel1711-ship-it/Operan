'use client';

import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

type StatCardProps = {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  accent?: 'blue' | 'green' | 'amber' | 'violet';
  trend?: number;
  sparkline?: number[];
};

const accentClasses: Record<NonNullable<StatCardProps['accent']>, { icon: string; spark: string; glow: string }> = {
  blue: { icon: 'text-[var(--brand-primary)]', spark: 'var(--brand-primary)', glow: 'bg-[var(--brand-primary)]/5' },
  green: { icon: 'text-success', spark: '#22C55E', glow: 'bg-success/5' },
  amber: { icon: 'text-warning', spark: '#F59E0B', glow: 'bg-warning/5' },
  violet: { icon: 'text-accent', spark: '#8B5CF6', glow: 'bg-accent/5' },
};

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 28;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`);
  const path = `M ${points.join(' L ')}`;
  const areaPath = `${path} L ${w},${h} L 0,${h} Z`;
  const gradId = `spark-${color.replace('#', '')}`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = 'blue',
  trend,
  sparkline,
}: StatCardProps) {
  const colors = accentClasses[accent];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-[var(--card-bg)] p-5 shadow-card transition-all duration-200 hover:shadow-card-hover">
      <div className={cn('pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl', colors.glow)} />
      <div className="relative flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary', colors.icon)}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>
      <div className="relative mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {typeof trend === 'number' && (
            <span className={cn('text-xs font-medium', trend >= 0 ? 'text-success' : 'text-destructive')}>
              {trend >= 0 ? '+' : ''}{trend}%
            </span>
          )}
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
        {sparkline && sparkline.length >= 2 && (
          <Sparkline data={sparkline} color={colors.spark} />
        )}
      </div>
    </div>
  );
}
