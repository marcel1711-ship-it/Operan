'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Copy, Check, Link2, Code2, ExternalLink, Frame, Globe,
  AlertCircle, Eye, RefreshCw, FileText, Monitor, Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { buildListingUrl, buildBookingUrl, buildEmbedBookingUrl, buildTenantUrl } from '@/lib/utils';

export type ListingStatus = {
  is_active: boolean;
  online_booking_enabled: boolean;
  slug: string | null;
  updated_at: string | null;
};

export function EmbedLinksSection({
  tenantSlug,
  listingSlug,
  listingName,
  status,
  onRegenerateSlug,
}: {
  tenantSlug: string;
  listingSlug: string;
  listingName: string;
  status: ListingStatus;
  onRegenerateSlug?: () => void;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [buttonLabel, setButtonLabel] = useState(`Book ${listingName}`);
  const [buttonTarget, setButtonTarget] = useState<'same' | 'new' | 'modal'>('new');

  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }).catch(() => {
      setCopiedKey(null);
    });
  }, []);

  const publicUrl = useMemo(() => buildListingUrl(tenantSlug, listingSlug), [tenantSlug, listingSlug]);
  const bookingUrl = useMemo(() => buildBookingUrl(tenantSlug, listingSlug), [tenantSlug, listingSlug]);
  const embedUrl = useMemo(() => buildEmbedBookingUrl(tenantSlug, listingSlug), [tenantSlug, listingSlug]);
  const catalogUrl = useMemo(() => buildTenantUrl(tenantSlug), [tenantSlug]);

  const isPublished = status.is_active;
  const bookingEnabled = status.online_booking_enabled;

  // Iframe code with all required attributes
  const iframeCode = `<iframe
  src="${embedUrl}"
  width="100%"
  height="800"
  frameborder="0"
  allow="payment"
  title="Book ${listingName}"
  referrerpolicy="no-referrer-when-downgrade"
  style="border:none;width:100%;min-height:800px;"
></iframe>`;

  // Button integration code
  const buttonCode = useMemo(() => {
    if (buttonTarget === 'modal') {
      return `<!-- Book Now button for ${listingName} — opens modal -->
<button onclick="openOperanBooking()" style="padding:12px 28px;background:#27c4b7;color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;">${buttonLabel}</button>
<!-- Add the modal snippet below to your page for the modal to work -->`;
    }
    const target = buttonTarget === 'new' ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${bookingUrl}"${target} style="display:inline-block;padding:12px 28px;background:#27c4b7;color:#fff;text-decoration:none;border-radius:10px;font-size:16px;font-weight:600;">${buttonLabel}</a>`;
  }, [buttonLabel, buttonTarget, bookingUrl, listingName]);

  // Modal snippet with origin validation, no duplicate IDs, no [APP_URL]
  const modalSnippet = `<!-- OPERAN Booking Modal for ${listingName} -->
<!-- Paste this once in your page body -->
<style>
  #operan-modal-${listingSlug}{position:fixed;inset:0;background:rgba(0,0,0,0.6);display:none;align-items:center;justify-content:center;z-index:99999;padding:16px;}
  #operan-modal-${listingSlug}.open{display:flex;}
  #operan-modal-${listingSlug} .operan-modal-inner{position:relative;width:100%;max-width:480px;background:#fff;border-radius:16px;overflow:hidden;max-height:90vh;display:flex;flex-direction:column;}
  #operan-modal-${listingSlug} iframe{width:100%;flex:1;border:none;min-height:600px;}
  #operan-modal-${listingSlug} .operan-close{position:absolute;top:8px;right:8px;width:32px;height:32px;border-radius:50%;background:rgba(0,0,0,0.6);color:#fff;border:none;font-size:18px;cursor:pointer;z-index:1;display:flex;align-items:center;justify-content:center;}
</style>
<div id="operan-modal-${listingSlug}" onclick="if(event.target===this)operanClose_${listingSlug.replace(/-/g, '_')}()">
  <div class="operan-modal-inner">
    <button class="operan-close" onclick="operanClose_${listingSlug.replace(/-/g, '_')}()">&#10005;</button>
    <iframe id="operan-iframe-${listingSlug}" src="${embedUrl}" allow="payment" title="Book ${listingName}"></iframe>
  </div>
</div>
<script>
(function(){
  var m=document.getElementById('operan-modal-${listingSlug}');
  var f=document.getElementById('operan-iframe-${listingSlug}');
  var po=document.body.style.overflow;
  var o='${embedUrl.split('?')[0]}';
  window.operanOpen_${listingSlug.replace(/-/g, '_')}=function(){m.classList.add('open');po=document.body.style.overflow;document.body.style.overflow='hidden';};
  window.operanClose_${listingSlug.replace(/-/g, '_')}=function(){m.classList.remove('open');document.body.style.overflow=po;f.src=f.src;};
  document.addEventListener('keydown',function(e){if(e.key==='Escape')operanClose_${listingSlug.replace(/-/g, '_')}();});
  window.addEventListener('message',function(e){
    if(!e.data||e.data.source!=='operan-embed')return;
    if(e.origin!==o.replace(/\\/\\?.*/,'').replace(/^http:/,'https:'))return;
    switch(e.data.type){
      case 'OPERAN_EMBED_RESIZE':f.style.height=(e.data.height+40)+'px';break;
      case 'OPERAN_BOOKING_COMPLETED':break;
      case 'OPERAN_EMBED_CLOSE':operanClose_${listingSlug.replace(/-/g, '_')}();break;
    }
  });
})();
</script>`;

  return (
    <div className="space-y-6">
      {/* Publication Status */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Publication Status</h4>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <StatusItem label="Status" value={
            isPublished
              ? <Badge className="bg-green-500/15 text-green-600 border-0">Published</Badge>
              : <Badge className="bg-amber-500/15 text-amber-600 border-0">Unpublished</Badge>
          } />
          <StatusItem label="Booking" value={
            bookingEnabled
              ? <Badge className="bg-green-500/15 text-green-600 border-0">Enabled</Badge>
              : <Badge className="bg-slate-500/15 text-slate-500 border-0">Disabled</Badge>
          } />
          <StatusItem label="Slug" value={<code className="text-xs text-foreground">{listingSlug || '—'}</code>} />
          <StatusItem label="Last Updated" value={
            status.updated_at
              ? new Date(status.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              : '—'
          } />
        </div>
        {!isPublished && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              This listing is not published. Public booking links will not be available to customers until you publish it.
              Toggle &quot;Visible on public page&quot; in the Basic Info tab to publish.
            </p>
          </div>
        )}
        {isPublished && !bookingEnabled && (
          <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 p-3">
            <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
              Online booking is disabled for this listing. Customers can view the listing but cannot book online.
              Enable &quot;Online Booking&quot; in the Booking Rules tab to accept bookings.
            </p>
          </div>
        )}
      </div>

      {/* 1. Public Listing Page */}
      <LinkSection
        icon={Link2}
        title="Public Listing Page"
        description="Share a complete page for this listing."
        url={publicUrl}
        copiedKey={copiedKey}
        copyKey="public"
        onCopy={copy}
        onPreview={() => setPreviewUrl(publicUrl)}
        previewLabel="Open preview"
      />

      {/* 2. Direct Booking Link */}
      <LinkSection
        icon={Link2}
        title="Direct Booking Link"
        description="Send customers directly to this listing's booking flow."
        url={bookingUrl}
        copiedKey={copiedKey}
        copyKey="booking"
        onCopy={copy}
        onPreview={() => setPreviewUrl(bookingUrl)}
        previewLabel="Test booking"
      />

      {/* 3. Embedded Booking Link */}
      <LinkSection
        icon={Frame}
        title="Embedded Booking Link"
        description="Keep customers on your website while they book."
        url={embedUrl}
        copiedKey={copiedKey}
        copyKey="embed"
        onCopy={copy}
        onPreview={() => setPreviewUrl(embedUrl)}
        previewLabel="Preview embed"
      />

      {/* 4. Button Integration Code */}
      <div className="space-y-2">
        <SectionHeader icon={Code2} title="Button Integration Code" description="Add a Book Now button to your website." />
        <div className="rounded-xl border border-border bg-card p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Button Label</Label>
              <Input value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} className="bg-[var(--card-bg)] text-sm h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Open Behavior</Label>
              <select value={buttonTarget} onChange={(e) => setButtonTarget(e.target.value as 'same' | 'new' | 'modal')} className="h-8 w-full rounded-lg border border-border bg-[var(--card-bg)] px-2 text-sm">
                <option value="same">Open in same tab</option>
                <option value="new">Open in new tab</option>
                <option value="modal">Open in modal</option>
              </select>
            </div>
          </div>
          <CodeBlock code={buttonCode} onCopy={() => copy(buttonCode, 'button')} copied={copiedKey === 'button'} />
          {buttonTarget === 'modal' && (
            <p className="text-[10px] text-amber-600 flex items-start gap-1">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              You also need to add the Modal Integration Code below to your page for the modal to work.
            </p>
          )}
        </div>
      </div>

      {/* 5. Modal Integration Code */}
      <div className="space-y-2">
        <SectionHeader icon={Code2} title="Modal Integration Code" description="Open the booking flow over your existing website." />
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <CodeBlock code={modalSnippet} onCopy={() => copy(modalSnippet, 'modal')} copied={copiedKey === 'modal'} rows={14} />
          <ul className="text-[10px] text-muted-foreground space-y-0.5 pl-4 list-disc">
            <li>Closes with the X button, backdrop click, or Escape key</li>
            <li>Prevents background scrolling while open</li>
            <li>Validates message origin — only accepts messages from the booking URL</li>
            <li>Auto-resizes the iframe via postMessage</li>
            <li>Supports payment flows inside the modal</li>
            <li>Uses unique IDs to avoid collisions with other snippets</li>
          </ul>
        </div>
      </div>

      {/* 6. Iframe Integration Code */}
      <div className="space-y-2">
        <SectionHeader icon={Code2} title="Iframe Integration Code" description="Embed the booking widget directly in your page." />
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <CodeBlock code={iframeCode} onCopy={() => copy(iframeCode, 'iframe')} copied={copiedKey === 'iframe'} />
          <p className="text-[10px] text-muted-foreground">
            Paste this into your website HTML where you want the booking widget to appear.
            The iframe is responsive and supports payment flows.
          </p>
        </div>
      </div>

      {/* Slug regeneration */}
      {onRegenerateSlug && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Need a different URL?</span>
          <Button size="sm" variant="outline" onClick={onRegenerateSlug} className="ml-auto h-7 text-xs">
            Regenerate Slug
          </Button>
        </div>
      )}

      {/* Preview Modal */}
      {previewUrl && (
        <PreviewModal
          url={previewUrl}
          mode={previewMode}
          onClose={() => setPreviewUrl(null)}
          onModeChange={setPreviewMode}
        />
      )}
    </div>
  );
}

function StatusItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <div>{value}</div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description }: { icon: typeof Link2; title: string; description: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function LinkSection({
  icon: Icon,
  title,
  description,
  url,
  copiedKey,
  copyKey,
  onCopy,
  onPreview,
  previewLabel,
}: {
  icon: typeof Link2;
  title: string;
  description: string;
  url: string;
  copiedKey: string | null;
  copyKey: string;
  onCopy: (text: string, key: string) => void;
  onPreview: () => void;
  previewLabel: string;
}) {
  return (
    <div className="space-y-2">
      <SectionHeader icon={Icon} title={title} description={description} />
      <div className="flex items-center gap-2">
        <Input readOnly value={url} className="bg-[var(--card-bg)] text-sm font-mono" />
        <Button size="sm" variant="outline" onClick={() => onCopy(url, copyKey)} className="shrink-0">
          {copiedKey === copyKey ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
        <Button size="sm" variant="outline" onClick={onPreview} className="shrink-0">
          <Eye className="h-3.5 w-3.5" />
        </Button>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary shrink-0">
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      <p className="text-[10px] text-muted-foreground">{previewLabel} opens the page in a new preview window.</p>
    </div>
  );
}

function CodeBlock({ code, onCopy, copied, rows = 6 }: { code: string; onCopy: () => void; copied: boolean; rows?: number }) {
  return (
    <div className="flex items-start gap-2">
      <Textarea readOnly rows={rows} className="resize-none bg-[var(--card-bg)] text-[10px] font-mono leading-relaxed" value={code} />
      <Button size="sm" variant="outline" onClick={onCopy} className="shrink-0 mt-1">
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function PreviewModal({ url, mode, onClose, onModeChange }: { url: string; mode: 'desktop' | 'mobile'; onClose: () => void; onModeChange: (m: 'desktop' | 'mobile') => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="relative w-full max-w-3xl rounded-2xl bg-card shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Preview</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onModeChange('desktop')} className={`rounded-lg p-1.5 ${mode === 'desktop' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
              <Monitor className="h-4 w-4" />
            </button>
            <button onClick={() => onModeChange('mobile')} className={`rounded-lg p-1.5 ${mode === 'mobile' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
              <Smartphone className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
              ✕
            </button>
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
