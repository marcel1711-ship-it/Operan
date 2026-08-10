'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Plus, Ship, Trash2, Pencil, X, Loader2, Anchor, DollarSign,
  Users, MapPin, Upload, GripVertical, ImageIcon, ExternalLink, Globe,
  Clock, Calendar, Settings, CheckCircle2, AlertCircle, Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { cn, buildListingUrl, buildBookingUrl, buildEmbedBookingUrl } from '@/lib/utils';
import { EmbedLinksSection } from '@/components/listings/embed-links-section';

type PricingOption = {
  id: string;
  name: string;
  duration_minutes: number;
  base_price: number;
  pricing_type: string;
  minimum_guests: number | null;
  maximum_guests: number | null;
  price_per_additional_guest: number;
  included_guests: number;
  start_time_restriction: string | null;
  is_active: boolean;
  sort_order: number;
};

type OperatingHour = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

type ListingBlock = {
  id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
  block_type: string;
  notes: string | null;
};

type FixedStartTime = {
  id: string;
  day_of_week: number;
  start_time: string;
  pricing_option_id: string | null;
  is_active: boolean;
  sort_order: number;
};

type Listing = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  short_description: string | null;
  full_description: string | null;
  photos: string[];
  price_per_hour: number;
  price_half_day: number;
  price_full_day: number;
  deposit_amount: number;
  booking_durations: number[];
  capacity: number;
  minimum_guests: number;
  length_ft: number | null;
  boat_type: string | null;
  year: number | null;
  location: string | null;
  amenities: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  listing_type: string;
  meeting_point: string | null;
  currency: string;
  timezone: string;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_hours: number;
  maximum_advance_days: number;
  instant_booking: boolean;
  requires_approval: boolean;
  payment_mode: string;
  deposit_type: string;
  deposit_percentage: number;
  deposit_fixed_amount: number;
  hold_duration_minutes: number;
  tax_percentage: number;
  service_fee_type: string;
  service_fee_percentage: number;
  service_fee_fixed_amount: number;
  slot_mode: string;
  slot_interval_minutes: number;
  online_booking_enabled: boolean;
  request_to_book_enabled: boolean;
  request_blocks_availability: boolean;
  request_expiration_hours: number;
  meeting_instructions: string | null;
  customer_instructions: string | null;
  cancellation_policy_text: string | null;
  terms_summary: string | null;
  updated_at: string | null;
};

type Tab = 'basic' | 'pricing' | 'deposit' | 'availability' | 'rules' | 'website';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const PRICING_TYPES = [
  { value: 'flat', label: 'Flat Rate' },
  { value: 'per_person', label: 'Per Person' },
  { value: 'flat_plus_additional_guest', label: 'Flat + Additional Guests' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'custom_package', label: 'Custom Package' },
];

const PAYMENT_MODES = [
  { value: 'deposit', label: 'Deposit Required' },
  { value: 'full_payment', label: 'Full Payment' },
  { value: 'request_only', label: 'Request Only (No Payment)' },
  { value: 'pay_at_location', label: 'Pay at Location' },
];

const DEPOSIT_TYPES = [
  { value: 'percentage', label: 'Percentage' },
  { value: 'fixed', label: 'Fixed Amount' },
  { value: 'none', label: 'No Deposit' },
];

const SLOT_MODES = [
  { value: 'interval', label: 'Fixed Interval (e.g. every 60 min)' },
  { value: 'fixed_times', label: 'Fixed Departure Times' },
  { value: 'request_any_time', label: 'Request Any Time' },
];

function defaultForm(): Partial<Listing> {
  return {
    name: '', slug: '', description: '', short_description: '', full_description: '',
    photos: [], capacity: 1, minimum_guests: 1,
    length_ft: null, boat_type: '', year: null, location: '',
    amenities: [], is_active: true, listing_type: 'boat',
    meeting_point: '', currency: 'USD', timezone: 'America/New_York',
    buffer_before_minutes: 0, buffer_after_minutes: 0,
    minimum_notice_hours: 24, maximum_advance_days: 365,
    instant_booking: true, requires_approval: false,
    payment_mode: 'deposit', deposit_type: 'percentage',
    deposit_percentage: 30, deposit_fixed_amount: 0,
    hold_duration_minutes: 15, tax_percentage: 0,
    service_fee_type: 'none', service_fee_percentage: 0,
    service_fee_fixed_amount: 0, slot_mode: 'interval',
    slot_interval_minutes: 60, online_booking_enabled: false,
    request_to_book_enabled: false, request_blocks_availability: false,
    request_expiration_hours: 48,
    meeting_instructions: '', customer_instructions: '',
    cancellation_policy_text: '', terms_summary: '',
    price_per_hour: 0, price_half_day: 0, price_full_day: 0,
    deposit_amount: 0, booking_durations: [], sort_order: 0,
  };
}

export default function ListingsPage() {
  const { tenant } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Listing | null>(null);
  const [form, setForm] = useState<Partial<Listing>>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('basic');
  const [pricingOptions, setPricingOptions] = useState<PricingOption[]>([]);
  const [operatingHours, setOperatingHours] = useState<OperatingHour[]>([]);
  const [blocks, setBlocks] = useState<ListingBlock[]>([]);
  const [fixedStartTimes, setFixedStartTimes] = useState<FixedStartTime[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [newBlock, setNewBlock] = useState({ start_at: '', end_at: '', block_type: 'manual', reason: '', notes: '' });
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    setListings((data as Listing[]) || []);
    setLoading(false);
  }, [tenant?.id]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(defaultForm());
    setPricingOptions([]);
    setOperatingHours([]);
    setBlocks([]);
    setFixedStartTimes([]);
    setTab('basic');
    setSaveSuccess(false);
    setShowDialog(true);
  }

  async function openEdit(l: Listing) {
    setEditing(l);
    setForm(l);
    setTab('basic');
    setShowDialog(true);
    const [po, oh, bl, ft] = await Promise.all([
      supabase.from('listing_pricing_options').select('*').eq('listing_id', l.id).order('sort_order'),
      supabase.from('listing_operating_hours').select('*').eq('listing_id', l.id).order('day_of_week'),
      supabase.from('listing_blocks').select('*').eq('listing_id', l.id).order('start_at'),
      supabase.from('listing_fixed_start_times').select('*').eq('listing_id', l.id).order('day_of_week').order('start_time'),
    ]);
    setPricingOptions((po.data as PricingOption[]) || []);
    setOperatingHours((oh.data as OperatingHour[]) || []);
    setBlocks((bl.data as ListingBlock[]) || []);
    setFixedStartTimes((ft.data as FixedStartTime[]) || []);
  }

  async function save() {
    if (!form.name?.trim() || !tenant?.id) return;
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    const slug = form.slug?.trim() || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const payload = { ...form, slug, tenant_id: tenant.id, updated_at: new Date().toISOString() };
    delete (payload as Record<string, unknown>).created_at;
    delete (payload as Record<string, unknown>).id;

    let listingId = editing?.id;

    if (editing) {
      const { error } = await supabase.from('listings').update(payload).eq('id', editing.id);
      if (error) { setError(error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('listings').insert(payload).select().single();
      if (error) { setError(error.message); setSaving(false); return; }
      setEditing(data as Listing);
      listingId = (data as Listing).id;
    }

    // Persist pricing options
    if (listingId) {
      for (const opt of pricingOptions) {
        const optPayload = {
          tenant_id: tenant.id,
          listing_id: listingId,
          name: opt.name,
          duration_minutes: opt.duration_minutes,
          base_price: opt.base_price,
          pricing_type: opt.pricing_type,
          minimum_guests: opt.minimum_guests,
          maximum_guests: opt.maximum_guests,
          price_per_additional_guest: opt.price_per_additional_guest,
          included_guests: opt.included_guests,
          start_time_restriction: opt.start_time_restriction,
          is_active: opt.is_active,
          sort_order: opt.sort_order,
          updated_at: new Date().toISOString(),
        };
        if (opt.id) {
          const { error } = await supabase.from('listing_pricing_options').update(optPayload).eq('id', opt.id);
          if (error) { setError(`Pricing option "${opt.name}": ${error.message}`); setSaving(false); return; }
        } else {
          const { error } = await supabase.from('listing_pricing_options').insert(optPayload);
          if (error) { setError(`Pricing option "${opt.name}": ${error.message}`); setSaving(false); return; }
        }
      }
    }

    setSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
    await load();
  }

  async function savePricingOption(idx: number) {
    const opt = pricingOptions[idx];
    if (!opt || !editing || !tenant?.id) return;
    if (!opt.name?.trim()) { setError('Option name is required'); return; }
    if (opt.duration_minutes <= 0) { setError('Duration must be greater than 0'); return; }
    if (opt.base_price < 0) { setError('Base price cannot be negative'); return; }
    const optPayload = {
      tenant_id: tenant.id,
      listing_id: editing.id,
      name: opt.name,
      duration_minutes: opt.duration_minutes,
      base_price: opt.base_price,
      pricing_type: opt.pricing_type,
      minimum_guests: opt.minimum_guests,
      maximum_guests: opt.maximum_guests,
      price_per_additional_guest: opt.price_per_additional_guest,
      included_guests: opt.included_guests,
      start_time_restriction: opt.start_time_restriction,
      is_active: opt.is_active,
      sort_order: opt.sort_order,
      updated_at: new Date().toISOString(),
    };
    if (opt.id) {
      const { data, error } = await supabase.from('listing_pricing_options').update(optPayload).eq('id', opt.id).select().single();
      if (error) { setError(error.message); return; }
      const next = [...pricingOptions]; next[idx] = data as PricingOption; setPricingOptions(next);
    } else {
      const { data, error } = await supabase.from('listing_pricing_options').insert(optPayload).select().single();
      if (error) { setError(error.message); return; }
      const next = [...pricingOptions]; next[idx] = data as PricingOption; setPricingOptions(next);
    }
  }

  async function togglePricingOptionActive(idx: number) {
    const opt = pricingOptions[idx];
    if (!opt?.id) return;
    const next = [...pricingOptions]; next[idx] = { ...opt, is_active: !opt.is_active };
    setPricingOptions(next);
    await supabase.from('listing_pricing_options').update({ is_active: !opt.is_active }).eq('id', opt.id);
  }

  async function deletePricingOption(idx: number) {
    const opt = pricingOptions[idx];
    if (!confirm(`Delete pricing option "${opt.label || 'Untitled'}"?`)) return;
    if (opt.id) {
      const { error: delErr } = await supabase.from('listing_pricing_options').delete().eq('id', opt.id);
      if (delErr) { setError(`Failed to delete: ${delErr.message}`); return; }
    }
    setPricingOptions(pricingOptions.filter((_, i) => i !== idx));
  }

  async function addBlock() {
    if (!editing || !tenant?.id || !newBlock.start_at || !newBlock.end_at) return;
    if (new Date(newBlock.start_at) >= new Date(newBlock.end_at)) { setError('Block start must be before end'); return; }
    const { data, error } = await supabase.from('listing_blocks').insert({
      listing_id: editing.id,
      start_at: newBlock.start_at, end_at: newBlock.end_at,
      block_type: newBlock.block_type, reason: newBlock.reason || null, notes: newBlock.notes || null,
    }).select().single();
    if (error) { setError(error.message); return; }
    setBlocks([...blocks, data as ListingBlock]);
    setNewBlock({ start_at: '', end_at: '', block_type: 'manual', reason: '', notes: '' });
    setShowBlockForm(false);
  }

  async function removeBlock(id: string) {
    await supabase.from('listing_blocks').delete().eq('id', id);
    setBlocks(blocks.filter(b => b.id !== id));
  }

  async function addFixedTime(dayIdx: number) {
    if (!editing || !tenant?.id) return;
    const { data, error } = await supabase.from('listing_fixed_start_times').insert({
      listing_id: editing.id,
      day_of_week: dayIdx, start_time: '09:00', is_active: true, sort_order: 0,
    }).select().single();
    if (error) { setError(error.message); return; }
    setFixedStartTimes([...fixedStartTimes, data as FixedStartTime]);
  }

  async function updateFixedTime(id: string, field: string, value: unknown) {
    await supabase.from('listing_fixed_start_times').update({ [field]: value }).eq('id', id);
    setFixedStartTimes(fixedStartTimes.map(f => f.id === id ? { ...f, [field]: value } as FixedStartTime : f));
  }

  async function removeFixedTime(id: string) {
    await supabase.from('listing_fixed_start_times').delete().eq('id', id);
    setFixedStartTimes(fixedStartTimes.filter(f => f.id !== id));
  }

  async function uploadPhotos(files: FileList) {
    if (!editing?.id || !tenant?.id) return;
    setUploadingPhoto(true);
    const newPhotos: string[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${tenant.slug}/${editing.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('listing-photos').upload(fileName, file);
      if (upErr) { setError(upErr.message); setUploadingPhoto(false); return; }
      const { data: urlData } = supabase.storage.from('listing-photos').getPublicUrl(fileName);
      newPhotos.push(urlData.publicUrl);
    }
    const updatedPhotos = [...(form.photos || []), ...newPhotos];
    setForm({ ...form, photos: updatedPhotos });
    const { error: dbErr } = await supabase.from('listings').update({ photos: updatedPhotos }).eq('id', editing.id);
    if (dbErr) { setError(dbErr.message); setUploadingPhoto(false); return; }
    setUploadingPhoto(false);
  }

  async function removePhoto(idx: number) {
    if (!editing?.id) return;
    const updatedPhotos = (form.photos || []).filter((_, i) => i !== idx);
    setForm({ ...form, photos: updatedPhotos });
    await supabase.from('listings').update({ photos: updatedPhotos }).eq('id', editing.id);
  }

  async function toggleActive(l: Listing) {
    await supabase.from('listings').update({ is_active: !l.is_active }).eq('id', l.id);
    setListings(prev => prev.map(x => x.id === l.id ? { ...x, is_active: !x.is_active } : x));
  }

  async function deleteListing() {
    if (!deleteId) return;
    await supabase.from('listings').delete().eq('id', deleteId);
    setListings(prev => prev.filter(x => x.id !== deleteId));
    setDeleteId(null);
  }

  function getReadiness(l: Listing): { ready: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!l.slug) missing.push('URL slug');
    if (!l.capacity || l.capacity < 1) missing.push('Capacity');
    if (!l.currency) missing.push('Currency');
    if (!l.timezone) missing.push('Timezone');
    if (!l.photos?.length) missing.push('At least one photo');
    if (!l.online_booking_enabled) missing.push('Online booking enabled');
    if (!l.payment_mode) missing.push('Payment mode');
    if (l.payment_mode === 'deposit' && l.deposit_type === 'percentage' && (!l.deposit_percentage || l.deposit_percentage <= 0)) missing.push('Deposit percentage');
    if (l.payment_mode === 'deposit' && l.deposit_type === 'fixed' && (!l.deposit_fixed_amount || l.deposit_fixed_amount <= 0)) missing.push('Fixed deposit amount');
    if (l.payment_mode !== 'request_only' && (!l.hold_duration_minutes || l.hold_duration_minutes < 5)) missing.push('Hold duration (min 5 min)');
    return { ready: missing.length === 0, missing };
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-[var(--card-bg)] px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-md">
              <Ship className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">Listings</h1>
              <p className="text-xs text-muted-foreground">{listings.length} listings · {listings.filter(l => l.is_active).length} active</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {tenant && (
              <a href={`/r/${tenant.slug}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-[var(--card-bg)] px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
                <ExternalLink className="h-4 w-4" /> View Public Page
              </a>
            )}
            <Button onClick={openCreate} className="bg-[var(--brand-primary)] text-primary-foreground hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" /> New Listing
            </Button>
          </div>
        </div>
      </header>

      <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {error && (
          <div className="flex items-center gap-2 rounded-[18px] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-[#FB7185]">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)}><X className="h-4 w-4" /></button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <Anchor className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No listings yet. Create your first listing to get started.</p>
            <Button onClick={openCreate} className="bg-[var(--brand-primary)] text-primary-foreground"><Plus className="mr-2 h-4 w-4" />New Listing</Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {listings.map((l) => {
              const readiness = getReadiness(l);
              return (
                <Card key={l.id} className={cn('overflow-hidden border-border shadow-sm transition-all hover:shadow-md', !l.is_active && 'opacity-60')}>
                  <div className="relative h-44 overflow-hidden bg-secondary">
                    {l.photos?.length > 0 ? (
                      <img src={l.photos[0]} alt={l.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center"><Ship className="h-10 w-10 text-muted-foreground/40" /></div>
                    )}
                    <div className="absolute right-2 top-2">
                      <Badge className={cn('border-0 text-xs font-semibold', l.is_active ? 'bg-[#86EFAC] text-success-foreground' : 'bg-secondary text-muted-foreground')}>
                        {l.is_active ? 'Active' : 'Hidden'}
                      </Badge>
                    </div>
                  </div>
                  <CardContent className="space-y-3 p-4">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{l.name}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {l.boat_type && <span className="flex items-center gap-1"><Anchor className="h-3 w-3" />{l.boat_type}</span>}
                        {l.capacity && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{l.capacity} guests</span>}
                        {l.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{l.location}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {readiness.ready ? (
                        <Badge className="bg-[rgba(99,119,255,0.10)] text-xs text-[var(--brand-primary)]"><CheckCircle2 className="mr-1 h-3 w-3" />Ready for Booking</Badge>
                      ) : (
                        <Badge className="bg-[rgba(251,191,36,0.12)] text-xs text-[#FCD34D]"><AlertCircle className="mr-1 h-3 w-3" />Config Incomplete</Badge>
                      )}
                      {l.online_booking_enabled && <Badge className="bg-[rgba(99,119,255,0.10)] text-xs text-[var(--brand-primary)]">Online Booking</Badge>}
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <div className="flex items-center gap-2">
                        <Switch checked={l.is_active} onCheckedChange={() => toggleActive(l)} />
                        <span className="text-[10px] text-muted-foreground">{l.is_active ? 'Visible' : 'Hidden'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(l)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-[var(--brand-primary)]">
                          <Settings className="h-4 w-4" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteId(l.id); }} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-[#FB7185]">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Edit/Create Dialog */}
      <Dialog open={showDialog} onOpenChange={(v) => { if (!v) { setShowDialog(false); setEditing(null); setForm(defaultForm()); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-[var(--card-bg)] shadow-xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">{editing ? 'Edit Listing' : 'New Listing'}</DialogTitle>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex flex-wrap gap-1 rounded-[18px] border border-border bg-[var(--card-bg)] p-1">
            {([
              { id: 'basic', label: 'Basic Info', icon: Ship },
              { id: 'pricing', label: 'Pricing', icon: DollarSign },
              { id: 'deposit', label: 'Deposit & Payment', icon: DollarSign },
              { id: 'availability', label: 'Availability', icon: Clock },
              { id: 'rules', label: 'Booking Rules', icon: Calendar },
              { id: 'website', label: 'Website & Booking', icon: Globe },
            ] as { id: Tab; label: string; icon: typeof Ship }[]).map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)}
                className={cn('flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                  tab === id ? 'bg-[var(--brand-primary)] text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>

          {/* Basic Info Tab */}
          {tab === 'basic' && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Listing Name *</Label>
                <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sea Ray 230 Sundancer" className="bg-[var(--card-bg)]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">URL Slug</Label>
                  <Input value={form.slug || ''} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto-generated from name" className="bg-[var(--card-bg)]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Listing Type</Label>
                  <Input value={form.listing_type || 'boat'} onChange={(e) => setForm({ ...form, listing_type: e.target.value })} placeholder="boat, yacht, tour..." className="bg-[var(--card-bg)]" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Short Description</Label>
                <Input value={form.short_description || ''} onChange={(e) => setForm({ ...form, short_description: e.target.value })} placeholder="One-line summary for cards" className="bg-[var(--card-bg)]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Full Description</Label>
                <Textarea value={form.full_description || form.description || ''} onChange={(e) => setForm({ ...form, full_description: e.target.value, description: e.target.value })} rows={3} className="resize-none bg-[var(--card-bg)]" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Capacity *</Label>
                  <Input type="number" value={form.capacity ?? ''} onChange={(e) => setForm({ ...form, capacity: e.target.value === '' ? undefined : parseInt(e.target.value) })} className="bg-[var(--card-bg)]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Min Guests</Label>
                  <Input type="number" value={form.minimum_guests ?? ''} onChange={(e) => setForm({ ...form, minimum_guests: e.target.value === '' ? undefined : parseInt(e.target.value) })} className="bg-[var(--card-bg)]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Length (ft)</Label>
                  <Input type="number" value={form.length_ft ?? ''} onChange={(e) => setForm({ ...form, length_ft: e.target.value === '' ? undefined : parseFloat(e.target.value) })} className="bg-[var(--card-bg)]" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Boat Type</Label>
                  <Input value={form.boat_type || ''} onChange={(e) => setForm({ ...form, boat_type: e.target.value })} placeholder="Yacht" className="bg-[var(--card-bg)]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Year</Label>
                  <Input type="number" value={form.year ?? ''} onChange={(e) => setForm({ ...form, year: e.target.value === '' ? undefined : parseInt(e.target.value) })} className="bg-[var(--card-bg)]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Location</Label>
                  <Input value={form.location || ''} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Marina Bay, FL" className="bg-[var(--card-bg)]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Currency</Label>
                  <Input value={form.currency || 'USD'} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="bg-[var(--card-bg)]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Timezone</Label>
                  <Input value={form.timezone || 'America/New_York'} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="bg-[var(--card-bg)]" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Amenities (comma separated)</Label>
                <Input value={(form.amenities || []).join(', ')} onChange={(e) => setForm({ ...form, amenities: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="Cooler, Sound System, GPS" className="bg-[var(--card-bg)]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Meeting Point</Label>
                <Input value={form.meeting_point || ''} onChange={(e) => setForm({ ...form, meeting_point: e.target.value })} placeholder="Dock A, Slip 12" className="bg-[var(--card-bg)]" />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label className="text-sm text-muted-foreground">Visible on public page</Label>
              </div>

              {/* Photos */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Photos</Label>
                {!editing && (
                  <p className="text-xs text-[#FCD34D]">Save the listing first before uploading photos.</p>
                )}
                {editing && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {(form.photos || []).map((photo, idx) => (
                        <div key={idx} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-secondary">
                          <img src={photo} alt={`Photo ${idx + 1}`} className="h-full w-full object-cover" />
                          <button
                            onClick={() => removePhoto(idx)}
                            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingPhoto}
                        className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-border bg-card text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                      >
                        {uploadingPhoto ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <Upload className="h-5 w-5" />
                            <span className="text-[10px]">Upload</span>
                          </div>
                        )}
                      </button>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => { if (e.target.files?.length) uploadPhotos(e.target.files); e.target.value = ''; }}
                    />
                    <p className="text-[10px] text-muted-foreground">Click the upload button to add photos. The first photo is used as the cover image.</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Pricing Tab */}
          {tab === 'pricing' && (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Pricing Options</h3>
                <Button size="sm" variant="outline" onClick={() => {
                  if (!editing) { setError('Save the listing first'); return; }
                  setPricingOptions([...pricingOptions, {
                    id: '', name: '', duration_minutes: 120, base_price: 0,
                    pricing_type: 'flat', minimum_guests: null, maximum_guests: null,
                    price_per_additional_guest: 0, included_guests: 0,
                    start_time_restriction: null, is_active: true, sort_order: pricingOptions.length,
                  }]);
                }}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Option
                </Button>
              </div>
              {saveSuccess && <p className="text-xs text-primary">Saved successfully!</p>}
              {!editing && <p className="text-xs text-[#FCD34D]">Save the listing first before adding pricing options.</p>}
              {pricingOptions.length === 0 && editing && (
                <p className="text-xs text-muted-foreground">No pricing options yet. Add at least one to enable online booking.</p>
              )}
              <div className="space-y-3">
                {pricingOptions.map((opt, idx) => (
                  <div key={idx} className="rounded-xl border border-border bg-card p-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Option name (e.g. 4 Hours)" value={opt.name}
                        onChange={(e) => { const next = [...pricingOptions]; next[idx] = { ...opt, name: e.target.value }; setPricingOptions(next); }}
                        className="bg-[var(--card-bg)] text-sm" />
                      <Select value={opt.pricing_type} onValueChange={(v) => { const next = [...pricingOptions]; next[idx] = { ...opt, pricing_type: v }; setPricingOptions(next); }}>
                        <SelectTrigger className="bg-[var(--card-bg)] text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PRICING_TYPES.map(pt => <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Duration (min)</Label>
                        <Input type="number" value={opt.duration_minutes}
                          onChange={(e) => { const next = [...pricingOptions]; next[idx] = { ...opt, duration_minutes: parseInt(e.target.value) || 60 }; setPricingOptions(next); }}
                          className="bg-[var(--card-bg)] text-sm" />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Base Price</Label>
                        <Input type="number" step="0.01" value={opt.base_price}
                          onChange={(e) => { const next = [...pricingOptions]; next[idx] = { ...opt, base_price: parseFloat(e.target.value) || 0 }; setPricingOptions(next); }}
                          className="bg-[var(--card-bg)] text-sm" />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Start Time</Label>
                        <Input type="time" value={opt.start_time_restriction || ''}
                          onChange={(e) => { const next = [...pricingOptions]; next[idx] = { ...opt, start_time_restriction: e.target.value || null }; setPricingOptions(next); }}
                          className="bg-[var(--card-bg)] text-sm" />
                      </div>
                    </div>
                    {opt.pricing_type === 'flat_plus_additional_guest' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Included Guests</Label>
                          <Input type="number" value={opt.included_guests}
                            onChange={(e) => { const next = [...pricingOptions]; next[idx] = { ...opt, included_guests: parseInt(e.target.value) || 0 }; setPricingOptions(next); }}
                            className="bg-[var(--card-bg)] text-sm" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Add'l Guest Price</Label>
                          <Input type="number" step="0.01" value={opt.price_per_additional_guest}
                            onChange={(e) => { const next = [...pricingOptions]; next[idx] = { ...opt, price_per_additional_guest: parseFloat(e.target.value) || 0 }; setPricingOptions(next); }}
                            className="bg-[var(--card-bg)] text-sm" />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch checked={opt.is_active} onCheckedChange={() => togglePricingOptionActive(idx)} />
                        <span className="text-[10px] text-muted-foreground">{opt.is_active ? 'Active' : 'Inactive'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => savePricingOption(idx)} disabled={!opt.name?.trim()} className="border-primary/30 bg-primary/5 text-[var(--brand-primary)] hover:bg-primary/10 px-2 py-1 text-xs">
                          {opt.id ? 'Save' : 'Save'}
                        </Button>
                        <button onClick={() => deletePricingOption(idx)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-[#FB7185]">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deposit & Payment Tab */}
          {tab === 'deposit' && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Payment Mode</Label>
                <Select value={form.payment_mode || 'deposit'} onValueChange={(v) => setForm({ ...form, payment_mode: v })}>
                  <SelectTrigger className="bg-[var(--card-bg)]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.payment_mode === 'deposit' && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Deposit Type</Label>
                    <Select value={form.deposit_type || 'percentage'} onValueChange={(v) => setForm({ ...form, deposit_type: v })}>
                      <SelectTrigger className="bg-[var(--card-bg)]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DEPOSIT_TYPES.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {form.deposit_type === 'percentage' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Deposit Percentage (%)</Label>
                      <Input type="number" min="0" max="100" step="1" value={form.deposit_percentage ?? 30}
                        onChange={(e) => setForm({ ...form, deposit_percentage: parseFloat(e.target.value) || 0 })} className="bg-[var(--card-bg)]" />
                      <p className="text-[10px] text-muted-foreground">Percentage of total to collect as deposit. Not hardcoded — each listing can have its own value.</p>
                    </div>
                  )}
                  {form.deposit_type === 'fixed' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Fixed Deposit Amount</Label>
                      <Input type="number" step="0.01" value={form.deposit_fixed_amount ?? 0}
                        onChange={(e) => setForm({ ...form, deposit_fixed_amount: parseFloat(e.target.value) || 0 })} className="bg-[var(--card-bg)]" />
                    </div>
                  )}
                </>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Hold Duration (minutes)</Label>
                <Input type="number" min="5" step="5" value={form.hold_duration_minutes ?? 15}
                  onChange={(e) => setForm({ ...form, hold_duration_minutes: parseInt(e.target.value) || 15 })} className="bg-[var(--card-bg)]" />
                <p className="text-[10px] text-muted-foreground">How long a booking hold lasts before expiring. Default: 15 minutes.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Tax (%)</Label>
                  <Input type="number" min="0" max="100" step="0.01" value={form.tax_percentage ?? 0}
                    onChange={(e) => setForm({ ...form, tax_percentage: parseFloat(e.target.value) || 0 })} className="bg-[var(--card-bg)]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Service Fee Type</Label>
                  <Select value={form.service_fee_type || 'none'} onValueChange={(v) => setForm({ ...form, service_fee_type: v })}>
                    <SelectTrigger className="bg-[var(--card-bg)]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="fixed">Fixed Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.service_fee_type === 'percentage' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Service Fee (%)</Label>
                  <Input type="number" min="0" step="0.01" value={form.service_fee_percentage ?? 0}
                    onChange={(e) => setForm({ ...form, service_fee_percentage: parseFloat(e.target.value) || 0 })} className="bg-[var(--card-bg)]" />
                </div>
              )}
              {form.service_fee_type === 'fixed' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Service Fee (Fixed)</Label>
                  <Input type="number" step="0.01" value={form.service_fee_fixed_amount ?? 0}
                    onChange={(e) => setForm({ ...form, service_fee_fixed_amount: parseFloat(e.target.value) || 0 })} className="bg-[var(--card-bg)]" />
                </div>
              )}
            </div>
          )}

          {/* Availability Tab */}
          {tab === 'availability' && (
            <div className="space-y-4 py-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Operating Hours</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Set when this listing is available. Times are in {form.timezone || 'America/New_York'}.</p>
              </div>
              {!editing && <p className="text-xs text-[#FCD34D]">Save the listing first before configuring hours.</p>}
              {DAYS.map((day, dayIdx) => {
                const hours = operatingHours.filter(h => h.day_of_week === dayIdx);
                return (
                  <div key={day} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
                    <div className="w-24 shrink-0 pt-1.5 text-sm font-medium text-foreground">{day}</div>
                    <div className="flex-1 space-y-2">
                      {hours.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Closed</p>
                      ) : hours.map((h, hIdx) => (
                        <div key={hIdx} className="flex items-center gap-2">
                          <Input type="time" value={h.start_time}
                            onChange={(e) => { const next = [...operatingHours]; const fi = next.findIndex(x => x.id === h.id); next[fi] = { ...h, start_time: e.target.value }; setOperatingHours(next); }}
                            className="bg-[var(--card-bg)] text-xs w-28" />
                          <span className="text-xs text-muted-foreground">to</span>
                          <Input type="time" value={h.end_time}
                            onChange={(e) => { const next = [...operatingHours]; const fi = next.findIndex(x => x.id === h.id); next[fi] = { ...h, end_time: e.target.value }; setOperatingHours(next); }}
                            className="bg-[var(--card-bg)] text-xs w-28" />
                          <button onClick={async () => {
                            if (h.id) await supabase.from('listing_operating_hours').delete().eq('id', h.id);
                            setOperatingHours(operatingHours.filter(x => x.id !== h.id));
                          }} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                      {editing && (
                        <button onClick={async () => {
                          const newHour = { listing_id: editing.id, day_of_week: dayIdx, start_time: '09:00', end_time: '17:00', is_active: true };
                          const { data } = await supabase.from('listing_operating_hours').insert(newHour).select().single();
                          if (data) setOperatingHours([...operatingHours, data as OperatingHour]);
                        }} className="text-xs text-primary hover:underline">+ Add hours</button>
                      )}
                    </div>
                  </div>
                );
              })}
              {editing && (
                <Button size="sm" variant="outline" onClick={async () => {
                  const mondayHours = operatingHours.filter(h => h.day_of_week === 1);
                  for (const dayIdx of [2, 3, 4, 5]) {
                    for (const h of mondayHours) {
                      await supabase.from('listing_operating_hours').insert({ listing_id: editing.id, day_of_week: dayIdx, start_time: h.start_time, end_time: h.end_time, is_active: true });
                    }
                  }
                  const { data } = await supabase.from('listing_operating_hours').select('*').eq('listing_id', editing.id).order('day_of_week');
                  setOperatingHours((data as OperatingHour[]) || []);
                }}>Copy Monday to Tue-Fri</Button>
              )}

              {/* Fixed Start Times */}
              {form.slot_mode === 'fixed_times' && editing && (
                <div className="mt-6 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Fixed Departure Times</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Set specific departure times for each day. Duration comes from the selected pricing option.</p>
                  </div>
                  {DAYS.map((day, dayIdx) => {
                    const times = fixedStartTimes.filter(f => f.day_of_week === dayIdx);
                    return (
                      <div key={day} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
                        <div className="w-24 shrink-0 pt-1.5 text-sm font-medium text-foreground">{day}</div>
                        <div className="flex-1 space-y-2">
                          {times.length === 0 && <p className="text-xs text-muted-foreground">No fixed times</p>}
                          {times.map((ft) => (
                            <div key={ft.id} className="flex items-center gap-2">
                              <Input type="time" value={ft.start_time}
                                onChange={(e) => updateFixedTime(ft.id, 'start_time', e.target.value)}
                                className="bg-[var(--card-bg)] text-xs w-28" />
                              <Switch checked={ft.is_active} onCheckedChange={(v) => updateFixedTime(ft.id, 'is_active', v)} />
                              <span className="text-[10px] text-muted-foreground">{ft.is_active ? 'Active' : 'Inactive'}</span>
                              <button onClick={() => removeFixedTime(ft.id)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          ))}
                          <button onClick={() => addFixedTime(dayIdx)} className="text-xs text-primary hover:underline">+ Add time</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Blocked Dates */}
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Blocked Dates</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Block time periods for maintenance, owner use, weather, etc.</p>
                  </div>
                  {editing && (
                    <Button size="sm" variant="outline" onClick={() => setShowBlockForm(!showBlockForm)}>
                      {showBlockForm ? 'Cancel' : <><Plus className="mr-1 h-3.5 w-3.5" />Add Block</>}
                    </Button>
                  )}
                </div>
                {showBlockForm && editing && (
                  <div className="rounded-xl border border-border bg-card p-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Start (date/time)</Label>
                        <Input type="datetime-local" value={newBlock.start_at}
                          onChange={(e) => setNewBlock({ ...newBlock, start_at: e.target.value })}
                          className="bg-[var(--card-bg)] text-sm" />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">End (date/time)</Label>
                        <Input type="datetime-local" value={newBlock.end_at}
                          onChange={(e) => setNewBlock({ ...newBlock, end_at: e.target.value })}
                          className="bg-[var(--card-bg)] text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Block Type</Label>
                        <Select value={newBlock.block_type} onValueChange={(v) => setNewBlock({ ...newBlock, block_type: v })}>
                          <SelectTrigger className="bg-[var(--card-bg)] text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="maintenance">Maintenance</SelectItem>
                            <SelectItem value="owner_use">Owner Use</SelectItem>
                            <SelectItem value="weather">Weather</SelectItem>
                            <SelectItem value="private_event">Private Event</SelectItem>
                            <SelectItem value="external_booking">External Booking</SelectItem>
                            <SelectItem value="manual">Manual</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Reason</Label>
                        <Input value={newBlock.reason} onChange={(e) => setNewBlock({ ...newBlock, reason: e.target.value })} className="bg-[var(--card-bg)] text-sm" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Internal Notes</Label>
                      <Input value={newBlock.notes} onChange={(e) => setNewBlock({ ...newBlock, notes: e.target.value })} className="bg-[var(--card-bg)] text-sm" />
                    </div>
                    <Button size="sm" onClick={addBlock} disabled={!newBlock.start_at || !newBlock.end_at} className="bg-primary text-primary-foreground">Add Block</Button>
                  </div>
                )}
                {blocks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No blocks configured.</p>
                ) : (
                  <div className="space-y-2">
                    {blocks.map((b) => (
                      <div key={b.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                        <div className="text-xs">
                          <span className="font-medium text-foreground">{b.block_type.replace(/_/g, ' ')}</span>
                          <span className="text-muted-foreground ml-2">{new Date(b.start_at).toLocaleString()} — {new Date(b.end_at).toLocaleString()}</span>
                          {b.reason && <span className="text-muted-foreground ml-2">({b.reason})</span>}
                        </div>
                        <button onClick={() => removeBlock(b.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Booking Rules Tab */}
          {tab === 'rules' && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Buffer Before (min)</Label>
                  <Input type="number" min="0" value={form.buffer_before_minutes ?? 0}
                    onChange={(e) => setForm({ ...form, buffer_before_minutes: parseInt(e.target.value) || 0 })} className="bg-[var(--card-bg)]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Buffer After (min)</Label>
                  <Input type="number" min="0" value={form.buffer_after_minutes ?? 0}
                    onChange={(e) => setForm({ ...form, buffer_after_minutes: parseInt(e.target.value) || 0 })} className="bg-[var(--card-bg)]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Minimum Notice (hours)</Label>
                  <Input type="number" min="0" value={form.minimum_notice_hours ?? 24}
                    onChange={(e) => setForm({ ...form, minimum_notice_hours: parseInt(e.target.value) || 0 })} className="bg-[var(--card-bg)]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Max Advance (days)</Label>
                  <Input type="number" min="1" value={form.maximum_advance_days ?? 365}
                    onChange={(e) => setForm({ ...form, maximum_advance_days: parseInt(e.target.value) || 365 })} className="bg-[var(--card-bg)]" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Slot Mode</Label>
                <Select value={form.slot_mode || 'interval'} onValueChange={(v) => setForm({ ...form, slot_mode: v })}>
                  <SelectTrigger className="bg-[var(--card-bg)]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SLOT_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.slot_mode === 'interval' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Slot Interval (minutes)</Label>
                  <Input type="number" min="15" step="15" value={form.slot_interval_minutes ?? 60}
                    onChange={(e) => setForm({ ...form, slot_interval_minutes: parseInt(e.target.value) || 60 })} className="bg-[var(--card-bg)]" />
                </div>
              )}
              <div className="space-y-3 rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-3">
                  <Switch checked={form.online_booking_enabled ?? false} onCheckedChange={(v) => setForm({ ...form, online_booking_enabled: v })} />
                  <Label className="text-sm text-muted-foreground">Enable Online Booking</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.request_to_book_enabled ?? false} onCheckedChange={(v) => setForm({ ...form, request_to_book_enabled: v })} />
                  <Label className="text-sm text-muted-foreground">Allow Request to Book</Label>
                </div>
                {form.request_to_book_enabled && (
                  <div className="flex items-center gap-3 pl-4">
                    <Switch checked={form.request_blocks_availability ?? false} onCheckedChange={(v) => setForm({ ...form, request_blocks_availability: v })} />
                    <Label className="text-xs text-muted-foreground">Pending requests block the time slot</Label>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Switch checked={form.instant_booking ?? true} onCheckedChange={(v) => setForm({ ...form, instant_booking: v })} />
                  <Label className="text-sm text-muted-foreground">Instant Booking (no approval needed)</Label>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Cancellation Policy</Label>
                <Textarea value={form.cancellation_policy_text || ''} onChange={(e) => setForm({ ...form, cancellation_policy_text: e.target.value })} rows={2} className="resize-none bg-[var(--card-bg)] text-sm" placeholder="Free cancellation up to 48 hours before..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Customer Instructions</Label>
                <Textarea value={form.customer_instructions || ''} onChange={(e) => setForm({ ...form, customer_instructions: e.target.value })} rows={2} className="resize-none bg-[var(--card-bg)] text-sm" placeholder="Arrive 15 minutes early..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Meeting Instructions</Label>
                <Textarea value={form.meeting_instructions || ''} onChange={(e) => setForm({ ...form, meeting_instructions: e.target.value })} rows={2} className="resize-none bg-[var(--card-bg)] text-sm" placeholder="Meet at Dock A..." />
              </div>
            </div>
          )}

          {/* Website & Booking Tab */}
          {tab === 'website' && (
            <div className="space-y-4 py-2">
              {editing && tenant ? (
                <EmbedLinksSection
                  tenantSlug={tenant.slug}
                  listingSlug={form.slug || ''}
                  listingName={form.name || ''}
                  status={{
                    is_active: form.is_active ?? true,
                    online_booking_enabled: form.online_booking_enabled ?? false,
                    slug: form.slug ?? null,
                    updated_at: (editing as Listing).updated_at || null,
                  }}
                  onRegenerateSlug={() => {
                    const newSlug = (form.name || 'listing').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                    setForm({ ...form, slug: newSlug });
                  }}
                />
              ) : (
                <p className="text-xs text-[#FCD34D]">Save the listing first to access website and booking links.</p>
              )}
              <div className="rounded-lg border border-border bg-card p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Listing Readiness</h4>
                <div className="space-y-2">
                  {[
                    { label: 'Has name', ok: !!form.name?.trim() },
                    { label: 'Has slug', ok: !!form.slug?.trim() },
                    { label: 'Has photos', ok: (form.photos?.length || 0) > 0 },
                    { label: 'Has capacity set', ok: (form.capacity || 0) > 0 },
                    { label: 'Has currency', ok: !!form.currency },
                    { label: 'Has timezone', ok: !!form.timezone },
                    { label: 'Has saved active pricing options', ok: pricingOptions.filter(p => p.is_active && p.id).length > 0 },
                    { label: 'Online booking enabled', ok: !!form.online_booking_enabled },
                    { label: 'Has operating hours', ok: operatingHours.length > 0 },
                    { label: 'Has valid payment config', ok: !!form.payment_mode && (form.payment_mode !== 'deposit' || form.deposit_type === 'none' || (form.deposit_type === 'percentage' && (form.deposit_percentage || 0) > 0) || (form.deposit_type === 'fixed' && (form.deposit_fixed_amount || 0) > 0)) },
                    { label: 'Has valid hold duration', ok: form.payment_mode !== 'request_only' ? (form.hold_duration_minutes || 0) >= 5 : true },
                    { label: 'Slot mode implemented', ok: form.slot_mode === 'interval' || form.slot_mode === 'fixed_times' },
                  ].map((check) => (
                    <div key={check.label} className="flex items-center gap-2 text-xs">
                      {check.ok ? <CheckCircle2 className="h-4 w-4 text-[var(--brand-primary)]" /> : <AlertCircle className="h-4 w-4 text-[#FCD34D]" />}
                      <span className={check.ok ? 'text-foreground' : 'text-muted-foreground'}>{check.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-[rgba(251,113,133,0.12)] px-3 py-2 text-xs text-[#FB7185]">{error}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); setEditing(null); setForm(defaultForm()); }} className="border-border bg-card">Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name?.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : editing ? 'Save Changes' : 'Create Listing'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <DialogContent className="border-border bg-card shadow-xl sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-foreground">Delete Listing?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently remove the listing and all its pricing options.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} className="border-border bg-card">Cancel</Button>
            <Button onClick={deleteListing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
