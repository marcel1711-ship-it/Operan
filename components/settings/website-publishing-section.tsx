'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Globe, Copy, Check, Code2, ExternalLink, Frame, Anchor,
  AlertCircle, Eye, Monitor, Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { buildTenantUrl } from '@/lib/utils';

export function WebsitePublishingSection({ tenantSlug }: { tenantSlug: string }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }).catch(() => {});
  }, []);

  const catalogUrl = useMemo(() => buildTenantUrl(tenantSlug), [tenantSlug]);
  const catalogEmbedUrl = useMemo(() => `${buildTenantUrl(tenantSlug)}?embed=1`, [tenantSlug]);

  const allListingsWidgetCode = `<iframe
  src="${catalogEmbedUrl}"
  width="100%"
  height="600"
  frameborder="0"
  allow="payment"
  title="Browse all experiences"
  referrerpolicy="no-referrer-when-downgrade"
  style="border:none;width:100%;min-height:600px;"
></iframe>`;

  const dynamicGridCode = `<!-- OPERAN Dynamic Listings Grid -->
<script>
(function(){
  var s=document.createElement('script');
  // The grid loads all active listings from ${catalogUrl}
  // and renders responsive cards that link to each listing's booking page.
  window.operanTenantSlug='${tenantSlug}';
  window.operanBaseUrl='${catalogUrl}';
})();
</script>
<!-- Or simply embed the iframe below for an always-updated grid -->`;

  return (
    <section className="rounded-2xl border border-border bg-[var(--card-bg)] p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
        <Globe className="h-4 w-4 text-[var(--brand-primary)]" /> Website Publishing
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Tenant-wide integration tools for showing all your listings on your external website.
        For individual listing booking links, use the &quot;Website & Booking&quot; tab inside each listing&apos;s editor.
      </p>

      <div className="mt-5 space-y-5">
        {/* Tenant Public Catalog URL */}
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Anchor className="h-4 w-4 text-[var(--brand-primary)] mt-0.5 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-foreground">Public Catalog URL</h4>
              <p className="text-[11px] text-muted-foreground">A page showing all your active listings.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input readOnly value={catalogUrl} className="bg-[var(--card-bg)] text-sm font-mono" />
            <Button size="sm" variant="outline" onClick={() => copy(catalogUrl, 'catalog')} className="shrink-0">
              {copiedKey === 'catalog' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPreviewUrl(catalogUrl)} className="shrink-0">
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <a href={catalogUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary shrink-0">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {/* All-Listings Widget */}
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Frame className="h-4 w-4 text-[var(--brand-primary)] mt-0.5 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-foreground">All-Listings Widget</h4>
              <p className="text-[11px] text-muted-foreground">Embed a browseable grid of all your listings on your website.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Textarea readOnly rows={7} className="resize-none bg-[var(--card-bg)] text-[10px] font-mono leading-relaxed" value={allListingsWidgetCode} />
            <Button size="sm" variant="outline" onClick={() => copy(allListingsWidgetCode, 'widget')} className="shrink-0 mt-1">
              {copiedKey === 'widget' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Paste this into your website HTML where you want the listings grid to appear.
          </p>
        </div>

        {/* Dynamic Listings Grid */}
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Code2 className="h-4 w-4 text-[var(--brand-primary)] mt-0.5 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-foreground">Dynamic Listings Grid</h4>
              <p className="text-[11px] text-muted-foreground">A lightweight script that loads your listings dynamically.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Textarea readOnly rows={8} className="resize-none bg-[var(--card-bg)] text-[10px] font-mono leading-relaxed" value={dynamicGridCode} />
            <Button size="sm" variant="outline" onClick={() => copy(dynamicGridCode, 'grid')} className="shrink-0 mt-1">
              {copiedKey === 'grid' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Installation Info */}
        <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-4">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Website URL</p>
            <p className="text-sm text-foreground">{tenantSlug ? `/${tenantSlug}` : 'Not set'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Installation Method</p>
            <p className="text-sm text-foreground">Iframe Embed</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Widget Status</p>
            <Badge className="bg-green-500/15 text-green-600 border-0">Ready</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Published Listings</p>
            <p className="text-sm text-foreground">Managed per-listing</p>
          </div>
        </div>

        {/* Instructions */}
        <div className="rounded-lg bg-blue-500/10 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-blue-700">How to install</p>
              <ol className="text-[11px] text-blue-600 space-y-0.5 pl-4 list-decimal">
                <li>Copy the All-Listings Widget code above.</li>
                <li>Open your website editor or HTML file.</li>
                <li>Paste the code where you want the listings grid to appear.</li>
                <li>Save and publish your page.</li>
                <li>For individual listing booking buttons, open each listing&apos;s editor and use the Website & Booking tab.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewUrl && (
        <PreviewModal
          url={previewUrl}
          mode={previewMode}
          onClose={() => setPreviewUrl(null)}
          onModeChange={setPreviewMode}
        />
      )}
    </section>
  );
}

function PreviewModal({ url, mode, onClose, onModeChange }: { url: string; mode: 'desktop' | 'mobile'; onClose: () => void; onModeChange: (m: 'desktop' | 'mobile') => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="relative w-full max-w-3xl rounded-2xl bg-card shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Preview</span>
          <div className="flex items-center gap-2">
            <button onClick={() => onModeChange('desktop')} className={`rounded-lg p-1.5 ${mode === 'desktop' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
              <Monitor className="h-4 w-4" />
            </button>
            <button onClick={() => onModeChange('mobile')} className={`rounded-lg p-1.5 ${mode === 'mobile' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
              <Smartphone className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground">✕</button>
          </div>
        </div>
        <div className="flex justify-center bg-slate-100 p-4" style={{ maxHeight: '70vh' }}>
          <iframe
            src={url}
            className="border-0 rounded-lg bg-white shadow-lg transition-all"
            style={{ width: mode === 'mobile' ? '375px' : '100%', height: mode === 'mobile' ? '667px' : '600px' }}
            title="Preview"
          />
        </div>
      </div>
    </div>
  );
}
