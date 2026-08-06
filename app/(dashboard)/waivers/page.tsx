'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, FileSignature, Eye, Download, Search, Calendar,
  User, Mail, Ship, Filter, FileText,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import DOMPurify from 'dompurify';

type SignedWaiver = {
  id: string;
  signer_name: string;
  signer_email: string | null;
  signed_at: string;
  signature_data_url: string;
  html_snapshot: string;
  template_id: string;
  reservation_id: string | null;
};

type Template = {
  id: string;
  title: string;
};

type Listing = {
  id: string;
  name: string;
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function WaiversPage() {
  const router = useRouter();
  const { user, role, tenant, loading: authLoading } = useAuth();
  const [signedWaivers, setSignedWaivers] = useState<SignedWaiver[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTemplate, setFilterTemplate] = useState<string>('all');
  const [viewing, setViewing] = useState<SignedWaiver | null>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!user) { router.push('/login'); return; }
      if (role === 'super_admin') { router.push('/super-admin'); return; }
      if (tenant) {
        loadData(tenant.id);
      }
    }
  }, [authLoading, user, role, tenant, router]);

  const loadData = useCallback(async (tenantId: string) => {
    setLoading(true);

    const [{ data: waiversData, error: wErr }, { data: tmplData }, { data: listData }] = await Promise.all([
      supabase
        .from('signed_waivers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('signed_at', { ascending: false }),
      supabase
        .from('waiver_templates')
        .select('id, title')
        .eq('tenant_id', tenantId),
      supabase
        .from('listings')
        .select('id, name')
        .eq('tenant_id', tenantId),
    ]);

    if (wErr) {
      console.error(wErr);
    } else {
      setSignedWaivers((waiversData as SignedWaiver[]) || []);
    }
    setTemplates((tmplData as Template[]) || []);
    setListings((listData as Listing[]) || []);
    setLoading(false);
  }, []);

  function getTemplateTitle(id: string): string {
    return templates.find((t) => t.id === id)?.title || 'Unknown Template';
  }

  function downloadHtml(w: SignedWaiver) {
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${w.signer_name} - Signed ${formatDate(w.signed_at)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #1e293b; }
  .signature-block { margin-top: 40px; padding-top: 20px; border-top: 2px solid #0d9488; }
  .signature-block img { max-height: 100px; }
  .meta { font-size: 12px; color: #64748b; margin-top: 8px; }
</style>
</head>
<body>
${w.html_snapshot}
<div class="signature-block">
  <p><strong>Signed by:</strong> ${w.signer_name}</p>
  ${w.signer_email ? `<p><strong>Email:</strong> ${w.signer_email}</p>` : ''}
  <p><strong>Date:</strong> ${formatDate(w.signed_at)}</p>
  <img src="${w.signature_data_url}" alt="Signature" />
</div>
</body>
</html>`;
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${w.signer_name.replace(/\s+/g, '_')}_signed_${new Date(w.signed_at).toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = signedWaivers.filter((w) => {
    const matchesSearch = !search ||
      w.signer_name.toLowerCase().includes(search.toLowerCase()) ||
      (w.signer_email || '').toLowerCase().includes(search.toLowerCase());
    const matchesTemplate = filterTemplate === 'all' || w.template_id === filterTemplate;
    return matchesSearch && matchesTemplate;
  });

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== 'tenant_admin') return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-[var(--card-bg)] px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-md shadow-teal/20">
            <FileSignature className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">Signed Waivers</h1>
            <p className="text-xs text-muted-foreground">View and download documents signed by customers</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Filters */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="bg-[var(--card-bg)] pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterTemplate} onValueChange={setFilterTemplate}>
              <SelectTrigger className="w-48 bg-[var(--card-bg)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Forms</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-[18px] border border-border bg-[var(--card-bg)] p-4 shadow-sm">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Signed</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{signedWaivers.length}</p>
          </div>
          <div className="rounded-[18px] border border-border bg-[var(--card-bg)] p-4 shadow-sm">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active Forms</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{templates.length}</p>
          </div>
          <div className="col-span-2 rounded-[18px] border border-border bg-[var(--card-bg)] p-4 shadow-sm sm:col-span-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Boats</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{listings.length}</p>
          </div>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-[var(--card-bg)] py-20 shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
              <FileSignature className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-semibold text-foreground">
                {signedWaivers.length === 0 ? 'No signed waivers yet' : 'No matches found'}
              </h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {signedWaivers.length === 0
                  ? 'When customers sign your forms, their signed documents will appear here.'
                  : 'Try adjusting your search or filter.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((w) => (
              <div
                key={w.id}
                className="rounded-2xl border border-border bg-[var(--card-bg)] p-4 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] bg-[rgba(99,119,255,0.10)]">
                      <FileText className="h-5 w-5 text-[var(--brand-primary)]" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-foreground">{w.signer_name}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <FileSignature className="h-3 w-3" />
                          {getTemplateTitle(w.template_id)}
                        </span>
                        {w.signer_email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {w.signer_email}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(w.signed_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm" variant="ghost" onClick={() => setViewing(w)}
                      className="h-8 w-8 p-0" title="View"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm" variant="ghost" onClick={() => downloadHtml(w)}
                      className="h-8 w-8 p-0" title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* View Dialog */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-8">
              <span>Signed Document</span>
              {viewing && (
                <Button
                  size="sm" variant="outline"
                  onClick={() => downloadHtml(viewing)}
                  className="absolute right-4 top-4 h-8 text-xs"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="max-h-[70vh] overflow-y-auto">
              {/* Meta bar */}
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-[var(--panel-bg)] px-4 py-3 text-xs">
                <span className="flex items-center gap-1 font-medium text-foreground">
                  <User className="h-3.5 w-3.5 text-[var(--brand-primary)]" /> {viewing.signer_name}
                </span>
                {viewing.signer_email && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> {viewing.signer_email}
                  </span>
                )}
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" /> {formatDate(viewing.signed_at)}
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <FileSignature className="h-3.5 w-3.5" /> {getTemplateTitle(viewing.template_id)}
                </span>
              </div>

              {/* Document */}
              <div
                className="border-x border-border bg-[var(--card-bg)] px-6 py-6 text-sm leading-relaxed text-foreground"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(viewing.html_snapshot, { ALLOWED_TAGS: ['p','br','b','i','u','strong','em','span','div','table','thead','tbody','tr','td','th','ul','ol','li','h1','h2','h3','h4','h5','h6','img','hr','a','blockquote','pre','code','sub','sup','dl','dt','dd','caption','colgroup','col','style'], ALLOWED_ATTR: ['style','class','id','src','alt','href','width','height','colspan','rowspan'], ALLOW_DATA_ATTR: false }) }}
              />

              {/* Signature */}
              <div className="rounded-b-lg border-x border-b border-border bg-[var(--card-bg)] px-6 py-5">
                <div className="border-t-2 border-primary pt-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Signature</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={viewing.signature_data_url}
                    alt="Signature"
                    className="mt-2 max-h-24"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Signed electronically on {formatDate(viewing.signed_at)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
