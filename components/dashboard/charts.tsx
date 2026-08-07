'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCompactCurrency } from '@/lib/format';
import type { PipelineStage, Opportunity } from '@/lib/types';

type ChartsProps = {
  stages: PipelineStage[];
  opportunities: Opportunity[];
};

export function Charts({ stages, opportunities }: ChartsProps) {
  const stageData = stages.map((s) => ({
    name: s.name,
    value: opportunities
      .filter((o) => o.stage_id === s.id && o.status === 'open')
      .reduce((sum, o) => sum + (o.monetary_value || 0), 0),
    count: opportunities.filter(
      (o) => o.stage_id === s.id && o.status === 'open',
    ).length,
  }));

  return (
    <Card className="border-border bg-[var(--card-bg)] shadow-card">
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Pipeline Value by Stage
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={stageData} margin={{ left: -16, right: 8 }}>
            <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: '#6B7280', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#6B7280', fontSize: 11 }}
              tickFormatter={(v) => formatCompactCurrency(Number(v))}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(99, 119, 255, 0.06)' }}
              contentStyle={{
                background: '#FFFFFF',
                border: '1px solid #E5E7EB',
                borderRadius: 12,
                color: '#111827',
                fontSize: 12,
                boxShadow: '0 8px 24px -4px rgba(0,0,0,0.08)',
              }}
              formatter={(value: number) => [
                formatCompactCurrency(value),
                'Value',
              ]}
            />
            <Bar
              dataKey="value"
              fill="var(--brand-primary)"
              radius={[8, 8, 0, 0]}
              maxBarSize={56}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
