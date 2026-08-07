'use client';

import { useState } from 'react';
import {
  Mail, Smartphone, MessageSquare, Bell, Clock, Split, GitBranch,
  Tag, FileText, Square, Webhook, CheckSquare, Zap,
  MoreVertical, Copy, Trash2, EyeOff, Eye, ChevronDown, ChevronRight,
  Check, X, Loader, Minus, Circle,
  type LucideIcon,
} from 'lucide-react';
import {
  type BuilderNode,
  type ExecutionState,
  getSummary,
  getActionDef,
  EXECUTION_STATE_CONFIG,
} from './builder-types';

const ICON_MAP: Record<string, LucideIcon> = {
  Mail, Smartphone, MessageSquare, Bell, Clock, Split, GitBranch,
  Tag, FileText, Square, Webhook, CheckSquare,
};

const EXEC_ICON_MAP: Record<string, LucideIcon> = {
  Circle, Loader, Clock, Check, X, Minus,
};

interface NodeCardProps {
  node: BuilderNode;
  isSelected: boolean;
  executionState?: ExecutionState;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleDisable: () => void;
  onToggleCollapse: () => void;
}

export default function WorkflowNodeCard({
  node,
  isSelected,
  executionState = 'idle',
  onEdit,
  onDuplicate,
  onDelete,
  onToggleDisable,
  onToggleCollapse,
}: NodeCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const isTrigger = node.type === 'trigger';
  const isBranch = node.actionType === 'if_else' || node.actionType === 'condition';
  const actionDef = !isTrigger ? getActionDef(node.actionType || '') : null;
  const Icon = isTrigger ? Zap : ICON_MAP[actionDef?.icon || ''] || GitBranch;
  const accentColor = isTrigger ? '#6377FF' : actionDef?.color || '#6377FF';
  const summary = getSummary(node);
  const execConfig = EXECUTION_STATE_CONFIG[executionState];
  const ExecIcon = EXEC_ICON_MAP[execConfig.icon] || Circle;
  const isCollapsed = node.collapsed;
  const isDisabled = node.disabled;

  return (
    <div
      className={`group relative w-[320px] rounded-[16px] border transition-all duration-200 ${
        isSelected
          ? 'operan-node-selected bg-[#161E31]'
          : 'border-white/[0.08] bg-[#161E31] hover:border-white/[0.15] hover-lift'
      } ${isDisabled ? 'opacity-50' : ''} ${
        executionState === 'running' ? 'ring-2 ring-[var(--brand-primary)]/30' : ''
      } ${executionState === 'completed' ? 'border-[#22C55E]/20' : ''}`}
    >
      {/* Execution state indicator */}
      {executionState !== 'idle' && (
        <div
          className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#0F1524]"
          style={{ backgroundColor: execConfig.bgColor, color: execConfig.color }}
        >
          <ExecIcon
            className={`h-3 w-3 ${executionState === 'running' ? 'animate-spin' : ''}`}
          />
        </div>
      )}

      {/* Card content */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
          >
            <Icon className="h-5 w-5" />
          </div>

          {/* Text */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]/60">
                {isTrigger ? 'Trigger' : actionDef?.label || 'Action'}
              </span>
              {isDisabled && (
                <span className="rounded-full bg-[#94A3B8]/10 px-2 py-0.5 text-[9px] font-medium text-[#94A3B8]">
                  Disabled
                </span>
              )}
            </div>
            <div
              className="mt-0.5 truncate text-sm font-medium text-white cursor-pointer"
              onClick={onEdit}
            >
              {node.label}
            </div>
            {!isCollapsed && summary && (
              <div className="mt-1 truncate text-xs text-[#94A3B8]">{summary}</div>
            )}
          </div>

          {/* Actions menu */}
          {!isTrigger && (
            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="rounded-lg p-1.5 text-[#94A3B8] opacity-0 transition-all hover:bg-white/[0.06] hover:text-white group-hover:opacity-100"
                aria-label="Node actions"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#151D2E] py-1 shadow-2xl">
                    {[
                      { label: 'Edit', icon: <Eye className="h-3.5 w-3.5" />, action: () => { onEdit(); setMenuOpen(false); } },
                      { label: 'Duplicate', icon: <Copy className="h-3.5 w-3.5" />, action: () => { onDuplicate(); setMenuOpen(false); } },
                      { label: isDisabled ? 'Enable' : 'Disable', icon: <EyeOff className="h-3.5 w-3.5" />, action: () => { onToggleDisable(); setMenuOpen(false); } },
                      { label: isCollapsed ? 'Expand' : 'Collapse', icon: isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />, action: () => { onToggleCollapse(); setMenuOpen(false); } },
                      { label: 'Delete', icon: <Trash2 className="h-3.5 w-3.5" />, action: () => { onDelete(); setMenuOpen(false); }, danger: true },
                    ].map((item) => (
                      <button
                        key={item.label}
                        onClick={item.action}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors hover:bg-white/[0.04] ${
                          item.danger ? 'text-[#EF4444]' : 'text-[#94A3B8] hover:text-white'
                        }`}
                      >
                        {item.icon}
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Collapse toggle for branch nodes */}
          {isBranch && (
            <button
              onClick={onToggleCollapse}
              className="shrink-0 rounded-lg p-1.5 text-[#94A3B8] transition-colors hover:bg-white/[0.06] hover:text-white"
              aria-label="Toggle collapse"
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Execution state label */}
        {executionState !== 'idle' && (
          <div className="mt-3 flex items-center gap-2 border-t border-white/[0.04] pt-3">
            <span
              className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: execConfig.bgColor, color: execConfig.color }}
            >
              <ExecIcon className={`h-2.5 w-2.5 ${executionState === 'running' ? 'animate-spin' : ''}`} />
              {execConfig.label}
            </span>
            {executionState === 'waiting' && (
              <span className="text-[10px] text-[#94A3B8]">Waiting for timer...</span>
            )}
            {executionState === 'failed' && (
              <span className="text-[10px] text-[#EF4444]/70">Check execution log</span>
            )}
          </div>
        )}
      </div>

      {/* Hover toolbar (quick actions) */}
      {!isTrigger && (
        <div className="absolute -right-2 top-1/2 flex -translate-y-1/2 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onEdit}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-[#151D2E] text-[#94A3B8] shadow-lg transition-colors hover:text-white"
            title="Edit"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDuplicate}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-[#151D2E] text-[#94A3B8] shadow-lg transition-colors hover:text-white"
            title="Duplicate"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-[#151D2E] text-[#94A3B8] shadow-lg transition-colors hover:text-[#EF4444]"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
