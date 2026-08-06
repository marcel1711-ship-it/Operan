'use client';

import { Phone, MessageSquare, StickyNote, FileText, CheckSquare, User, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';
import type { Opportunity, PipelineStage } from '@/lib/types';

type KanbanBoardProps = {
  stages: PipelineStage[];
  opportunities: Opportunity[];
  onOpenNotes: (opp: Opportunity) => void;
  onOpenDetail: (opp: Opportunity) => void;
  onMoveStage: (opportunityId: string, newStageId: string) => Promise<void>;
};

function stageColorClasses(color: string): { dot: string; bar: string } {
  const colorMap: Record<string, { dot: string; bar: string }> = {
    '#3b82f6': { dot: 'bg-[var(--brand-primary)]/100', bar: 'border-t-blue-500' },
    '#f59e0b': { dot: 'bg-warning/100', bar: 'border-t-amber-500' },
    '#8b5cf6': { dot: 'bg-violet-500', bar: 'border-t-violet-500' },
    '#10b981': { dot: 'bg-success', bar: 'border-t-success' },
    '#ef4444': { dot: 'bg-destructive/100', bar: 'border-t-red-500' },
    '#6b7280': { dot: 'bg-secondary/300', bar: 'border-t-gray-500' },
  };
  return colorMap[color] ?? { dot: 'bg-slate-500', bar: 'border-t-slate-500' };
}

function extractDateChip(name: string): string | null {
  const match = name.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:st|nd|rd|th)?[,\s]+\d{1,2}:\d{2}\s*(?:am|pm)/i);
  if (match) return match[0];

  const isoMatch = name.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    const d = new Date(isoMatch[1]);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  return null;
}

function extractSource(name: string): string {
  const parts = name.split('|');
  if (parts.length >= 2) {
    const source = parts[1].trim();
    if (source) return source;
  }
  return 'service_booking';
}

function extractTitle(name: string): string {
  const parts = name.split('|');
  return parts[0].trim() || name;
}

function OppCard({
  opp,
  onOpenNotes,
  onOpenDetail,
  onDragStart,
}: {
  opp: Opportunity;
  onOpenNotes: (opp: Opportunity) => void;
  onOpenDetail: (opp: Opportunity) => void;
  onDragStart: (e: React.DragEvent, oppId: string) => void;
}) {
  const title = extractTitle(opp.name);
  const source = extractSource(opp.name);
  const dateChip = extractDateChip(opp.name);
  const customerName = opp.customer?.full_name || opp.name;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, opp.id)}
      onClick={() => onOpenDetail(opp)}
      className="cursor-pointer rounded-[18px] border border-border bg-[var(--card-bg)] shadow-card transition-all hover:shadow-card-hover hover:border-[rgba(99,119,255,0.34)]"
    >
      <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-1">
        <p className="text-sm font-medium leading-snug text-foreground line-clamp-2">
          {title}
          {opp.name.includes('|') && (
            <span className="text-muted-foreground"> | {opp.name.split('|').slice(1).join('|').trim().substring(0, 20)}...</span>
          )}
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); onOpenNotes(opp); }}
          className="mt-0.5 shrink-0 rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          aria-label="View notes"
        >
          <User className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-3 py-1.5 space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-14 shrink-0">Source:</span>
          <span className="text-foreground">{source}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-14 shrink-0">Value:</span>
          <span className="text-foreground">{formatCurrency(opp.monetary_value)}</span>
        </div>
        {customerName && customerName !== opp.name && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-14 shrink-0">Client:</span>
            <span className="text-foreground truncate">{customerName}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border/50 px-3 py-2">
        <button onClick={(e) => { e.stopPropagation(); }} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Call">
          <Phone className="h-4 w-4" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); }} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Message">
          <MessageSquare className="h-4 w-4" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onOpenNotes(opp); }} className="relative text-muted-foreground hover:text-foreground transition-colors" aria-label="Notes">
          <StickyNote className="h-4 w-4" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); }} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Files">
          <FileText className="h-4 w-4" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); }} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Tasks">
          <CheckSquare className="h-4 w-4" />
        </button>

        {dateChip && (
          <span className="ml-auto flex items-center gap-1 rounded-lg bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 px-2 py-0.5 text-[10px] font-medium text-[var(--brand-primary)] whitespace-nowrap">
            <svg className="h-2.5 w-2.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5 1a1 1 0 0 0-1 1v1H3a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-1V2a1 1 0 0 0-2 0v1H6V2a1 1 0 0 0-1-1z" />
            </svg>
            {dateChip}
          </span>
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({
  stages,
  opportunities,
  onOpenNotes,
  onOpenDetail,
  onMoveStage,
}: KanbanBoardProps) {
  let draggedOppId: string | null = null;

  function handleDragStart(_e: React.DragEvent, oppId: string) {
    draggedOppId = oppId;
  }

  function handleDrop(e: React.DragEvent, stageId: string) {
    e.preventDefault();
    if (draggedOppId) {
      onMoveStage(draggedOppId, stageId);
      draggedOppId = null;
    }
  }

  const byStage = (stageId: string) =>
    opportunities.filter((o) => o.stage_id === stageId);
  const stageValue = (stageId: string) =>
    byStage(stageId).reduce((sum, o) => sum + (o.monetary_value || 0), 0);

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const items = byStage(stage.id);
        const colors = stageColorClasses(stage.color);

        return (
          <div
            key={stage.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, stage.id)}
            className={cn(
              'flex w-72 shrink-0 flex-col rounded-[18px] border border-border bg-secondary/20 border-t-2',
              colors.bar,
            )}
          >
            <div className="flex items-center justify-between px-3 py-2.5 bg-[var(--card-bg)] rounded-t-xl border-b border-border">
              <div className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', colors.dot)} />
                <span className="text-sm font-medium text-foreground">{stage.name}</span>
                <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground ml-1" />
              </div>
            </div>

            <div className="px-3 py-1.5 text-xs text-muted-foreground bg-[var(--card-bg)] border-b border-border/50">
              <span>{items.length} {items.length === 1 ? 'opportunity' : 'opportunities'}</span>
              <span className="mx-1">·</span>
              <span>{formatCurrency(stageValue(stage.id))}</span>
            </div>

            <div className="flex flex-col gap-2 overflow-y-auto p-2 max-h-[65vh]">
              {items.length === 0 && (
                <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                  No opportunities
                </div>
              )}
              {items.map((opp) => (
                <OppCard
                  key={opp.id}
                  opp={opp}
                  onOpenNotes={onOpenNotes}
                  onOpenDetail={onOpenDetail}
                  onDragStart={handleDragStart}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
