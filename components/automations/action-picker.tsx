'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Mail, Smartphone, MessageSquare, Bell, Clock, Split, GitBranch,
  Tag, FileText, Square, Webhook, CheckSquare, Search, X, Ship,
  type LucideIcon,
} from 'lucide-react';
import { ACTION_CATEGORIES, type ActionCatalogEntry } from './builder-types';

const ICON_MAP: Record<string, LucideIcon> = {
  Mail, Smartphone, MessageSquare, Bell, Clock, Split, GitBranch,
  Tag, FileText, Square, Webhook, CheckSquare, Ship,
};

interface ActionPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (actionType: string) => void;
  recentActions: string[];
  favoriteActions: string[];
  onToggleFavorite: (actionType: string) => void;
}

export default function ActionPicker({
  open,
  onClose,
  onSelect,
  recentActions,
  favoriteActions,
  onToggleFavorite,
}: ActionPickerProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setActiveCategory('All');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  if (!open) return null;

  // Flatten all actions for filtering
  const allActions: (ActionCatalogEntry & { category: string })[] = [];
  for (const cat of ACTION_CATEGORIES) {
    for (const action of cat.actions) {
      allActions.push({ ...action, category: cat.name } as ActionCatalogEntry & { category: string });
    }
  }

  // Recent set
  const recentSet = new Set(recentActions);
  const favoriteSet = new Set(favoriteActions);

  let filtered = allActions;
  if (query.trim()) {
    const q = query.toLowerCase();
    filtered = allActions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.desc.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q)
    );
  } else if (activeCategory !== 'All') {
    filtered = allActions.filter((a) => a.category === activeCategory);
  }

  // Favorites + Recent sections when no query
  const showSections = !query.trim() && activeCategory === 'All';
  const favorites = allActions.filter((a) => favoriteSet.has(a.type));
  const recents = allActions.filter((a) => recentSet.has(a.type) && !favoriteSet.has(a.type));

  // Build display list for keyboard nav
  const displayList = showSections
    ? [...favorites, ...recents, ...filtered.filter((a) => !favoriteSet.has(a.type) && !recentSet.has(a.type))]
    : filtered;

  // Keyboard navigation
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, displayList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = displayList[activeIndex];
      if (item) {
        onSelect(item.type);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  const categories = ['All', ...ACTION_CATEGORIES.map((c) => c.name)];

  let runningIdx = -1;

  function renderActionRow(action: ActionCatalogEntry & { category: string }, idx: number) {
    const Icon = ICON_MAP[action.icon] || GitBranch;
    const isFav = favoriteSet.has(action.type);
    const isActive = idx === activeIndex;
    return (
      <div
        key={`${action.type}-${idx}`}
        data-idx={idx}
        onClick={() => onSelect(action.type)}
        onMouseEnter={() => setActiveIndex(idx)}
        className={`group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
          isActive ? 'bg-[rgba(99,119,255,0.10)]' : 'hover:bg-white/[0.03]'
        }`}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${action.color}15`, color: action.color }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-white">{action.label}</div>
          <div className="truncate text-xs text-[#94A3B8]">{action.desc}</div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(action.type);
          }}
          className={`shrink-0 rounded-md p-1 transition-opacity ${
            isFav ? 'text-[#F59E0B] opacity-100' : 'text-[#94A3B8] opacity-0 group-hover:opacity-60 hover:!opacity-100'
          }`}
          aria-label="Toggle favorite"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
            <path d="M8 1.5l1.8 4 4.2.4-3.2 2.8 1 4.3L8 10.5l-3.8 2.5 1-4.3L2 5.9l4.2-.4L8 1.5z" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 backdrop-blur-sm pt-[15vh]"
        onClick={onClose}
      >
        {/* Picker panel */}
        <div
          className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111827] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onKeyDown}
        >
          {/* Search bar */}
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
            <Search className="h-4 w-4 text-[#94A3B8]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              placeholder="Search actions..."
              className="flex-1 bg-transparent text-sm text-white placeholder:text-[#94A3B8]/50 focus:outline-none"
            />
            <kbd className="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-[#94A3B8]">
              ESC
            </kbd>
            <button onClick={onClose} className="text-[#94A3B8] hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Category tabs */}
          {!query.trim() && (
            <div className="flex gap-1 overflow-x-auto border-b border-white/[0.06] px-3 py-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategory(cat);
                    setActiveIndex(0);
                  }}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeCategory === cat
                      ? 'bg-[var(--brand-primary)] text-white'
                      : 'text-[#94A3B8] hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Action list */}
          <div ref={listRef} className="max-h-[400px] overflow-y-auto p-2">
            {displayList.length === 0 && (
              <div className="py-12 text-center text-sm text-[#94A3B8]">
                No actions found
              </div>
            )}

            {showSections && favorites.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]/50">
                  Favorites
                </div>
                {favorites.map((a) => {
                  runningIdx++;
                  return renderActionRow(a, runningIdx);
                })}
              </>
            )}

            {showSections && recents.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]/50">
                  Recently Used
                </div>
                {recents.map((a) => {
                  runningIdx++;
                  return renderActionRow(a, runningIdx);
                })}
              </>
            )}

            {showSections ? (
              <>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]/50">
                  All Actions
                </div>
                {filtered
                  .filter((a) => !favoriteSet.has(a.type) && !recentSet.has(a.type))
                  .map((a) => {
                    runningIdx++;
                    return renderActionRow(a, runningIdx);
                  })}
              </>
            ) : (
              displayList.map((a) => {
                runningIdx++;
                return renderActionRow(a, runningIdx);
              })
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5 text-[10px] text-[#94A3B8]/60">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-white/[0.08] bg-white/[0.03] px-1 py-0.5">↑↓</kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-white/[0.08] bg-white/[0.03] px-1 py-0.5">↵</kbd>
                Select
              </span>
            </div>
            <span>{displayList.length} actions</span>
          </div>
        </div>
      </div>
    </>
  );
}
