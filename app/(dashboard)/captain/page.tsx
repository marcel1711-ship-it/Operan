'use client';

export const dynamic = 'force-dynamic';

import { Anchor } from 'lucide-react';

export default function CaptainPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="relative">
        <header className="border-b border-border bg-[var(--card-bg)] px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-md shadow-teal/20">
              <Anchor className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">
                Captain
              </h1>
              <p className="text-xs text-muted-foreground">
                Pre-charter checklist and charter operations
              </p>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-[var(--card-bg)] py-20 shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
              <Anchor className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-semibold text-foreground">
                Captain Dashboard Coming Soon
              </h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                This page will show passengers who signed waivers for each
                reservation, a pre-departure checklist, and buttons to start or
                cancel a charter — automatically moving the opportunity in the
                pipeline.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
