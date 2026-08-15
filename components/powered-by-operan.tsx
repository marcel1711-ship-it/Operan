'use client';

export function PoweredByOperan({ className }: { className?: string }) {
  return (
    <div className={className ?? 'py-4 text-center'}>
      <a
        href="https://www.operan.io"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 32 32" fill="none" className="opacity-60">
          <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" />
          <circle cx="16" cy="16" r="5" fill="currentColor" />
          <circle cx="6" cy="16" r="2.5" fill="currentColor" />
          <circle cx="26" cy="16" r="2.5" fill="currentColor" />
          <line x1="8.5" y1="16" x2="11" y2="16" stroke="currentColor" strokeWidth="1.5" />
          <line x1="21" y1="16" x2="23.5" y2="16" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        Powered by <span className="font-semibold">OPERAN</span>
      </a>
    </div>
  );
}
