'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Trash2, Loader2, StickyNote } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { relativeTime } from '@/lib/format';
import type { Opportunity, OpportunityNote } from '@/lib/types';

type NotesDrawerProps = {
  opportunity: Opportunity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NotesDrawer({ opportunity, open, onOpenChange }: NotesDrawerProps) {
  const tenantId = opportunity?.tenant_id;
  const [notes, setNotes] = useState<OpportunityNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [body, setBody] = useState('');
  const [author, setAuthor] = useState('Team');
  const [error, setError] = useState<string | null>(null);

  const loadNotes = useCallback(async (oppId: string) => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('opportunity_notes_native')
      .select('*')
      .eq('opportunity_id', oppId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    setNotes((data as OpportunityNote[]) || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    if (opportunity && open) loadNotes(opportunity.id);
  }, [opportunity, open, loadNotes]);

  async function addNote() {
    if (!opportunity || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    const { data, error } = await supabase
      .from('opportunity_notes_native')
      .insert({
        tenant_id: opportunity.tenant_id,
        opportunity_id: opportunity.id,
        body: body.trim(),
        author_name: author.trim() || 'Team',
      })
      .select()
      .single();
    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }
    setNotes((prev) => [data as OpportunityNote, ...prev]);
    setBody('');
    setSubmitting(false);
  }

  async function deleteNote(id: string) {
    if (!tenantId) return;
    const prev = notes;
    setNotes((n) => n.filter((x) => x.id !== id));
    const { error } = await supabase
      .from('opportunity_notes_native')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) {
      setError(error.message);
      setNotes(prev);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full border-l-border bg-[var(--card-bg)] sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <StickyNote className="h-4 w-4 text-[var(--brand-primary)]" />
            Deal Notes
          </SheetTitle>
          <SheetDescription className="text-muted-foreground">
            {opportunity?.name}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-3">
          <Input
            placeholder="Your name"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="bg-[var(--card-bg)]"
          />
          <Textarea
            placeholder="Add a note about this deal..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="resize-none bg-[var(--card-bg)]"
          />
          <Button
            onClick={addNote}
            disabled={submitting || !body.trim()}
            
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              'Add Note'
            )}
          </Button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : notes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No notes yet. Be the first to add one.
            </p>
          ) : (
            notes.map((n) => (
              <div
                key={n.id}
                className="group rounded-[18px] border border-border bg-[var(--card-bg)] p-3 shadow-card"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--brand-primary)]">
                    {n.author_name}
                  </span>
                  <button
                    onClick={() => deleteNote(n.id)}
                    className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">
                  {n.body}
                </p>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  {relativeTime(n.created_at)}
                </p>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
