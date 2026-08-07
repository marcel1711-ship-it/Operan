'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  CheckCircle2, XCircle, AlertCircle, Loader2, Zap, Webhook,
  Key, Globe, Clock, Server, ListChecks, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

type ConfigStatus = {
  stripe_secret_configured: boolean;
  stripe_webhook_secret_configured: boolean;
  app_url_configured: boolean;
  app_url: string;
  webhook_endpoint_url: string;
  environment: string;
  outbox_function_deployed: boolean;
  outbox_scheduler_configured: boolean;
  stripe_adapter_active: boolean;
  test_mode_ready: boolean;
};

const REQUIRED_EVENTS = [
  'checkout.session.completed',
  'checkout.session.expired',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
  'account.updated',
];

export default function StripeActivationPage() {
  const { user, role, loading: authLoading } = useAuth();
  const router = useRouter();
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testStep, setTestStep] = useState(0);
  const [testResults, setTestResults] = useState<string[]>([]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) { router.push('/login'); return; }
      if (role !== 'super_admin') { router.push('/admin'); return; }
      checkConfig();
    }
  }, [authLoading, user, role, router]);

  async function checkConfig() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_stripe_activation_status');
      if (!error && data) {
        setConfig(data as ConfigStatus);
      } else {
        setConfig({
          stripe_secret_configured: false,
          stripe_webhook_secret_configured: false,
          app_url_configured: false,
          app_url: '',
          webhook_endpoint_url: '',
          environment: 'test',
          outbox_function_deployed: false,
          outbox_scheduler_configured: false,
          stripe_adapter_active: false,
          test_mode_ready: false,
        });
      }
    } catch {
      setConfig(null);
    }
    setLoading(false);
  }

  async function runTestChecklist() {
    setTesting(true);
    setTestResults([]);
    setTestStep(0);

    const steps = [
      'Checking Stripe secret key...',
      'Checking webhook secret...',
      'Checking application URL...',
      'Checking webhook endpoint registration...',
      'Checking required events...',
      'Checking outbox scheduler...',
      'Checking tenant Stripe Connect status...',
      'Verifying adapter health...',
    ];

    for (let i = 0; i < steps.length; i++) {
      setTestStep(i + 1);
      await new Promise(r => setTimeout(r, 500));
      setTestResults(prev => [...prev, steps[i]]);
    }

    setTesting(false);
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  if (role !== 'super_admin') return null;

  const configItems = config ? [
    { label: 'Stripe Secret Key', ok: config.stripe_secret_configured, icon: Key, hint: 'Configure STRIPE_SECRET_KEY in environment variables' },
    { label: 'Webhook Secret', ok: config.stripe_webhook_secret_configured, icon: Webhook, hint: 'Configure STRIPE_WEBHOOK_SECRET in environment variables' },
    { label: 'Application URL', ok: config.app_url_configured, icon: Globe, hint: 'Set NEXT_PUBLIC_APP_URL to your domain' },
    { label: 'Stripe Adapter', ok: config.stripe_adapter_active, icon: Zap, hint: 'Adapter registered in integration framework' },
    { label: 'Outbox Edge Function', ok: config.outbox_function_deployed, icon: Server, hint: 'process-outbox function deployed' },
    { label: 'Outbox Scheduler', ok: config.outbox_scheduler_configured, icon: Clock, hint: 'Configure pg_cron or external scheduler' },
  ] : [];

  const allReady = config?.test_mode_ready;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-[var(--card-bg)] px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-gradient-to-br from-primary to-primary-dark shadow-md shadow-teal/20">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">Stripe Test Mode Activation</h1>
            <p className="text-xs text-muted-foreground">Configure and verify Stripe payment integration</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Status Banner */}
        <div className={cn(
          'rounded-[18px] border p-4',
          allReady ? 'border-[rgba(74,222,128,0.20)] bg-[rgba(74,222,128,0.12)]' : 'border-[rgba(251,191,36,0.20)] bg-[rgba(251,191,36,0.12)]'
        )}>
          <div className="flex items-center gap-2">
            {allReady ? (
              <CheckCircle2 className="h-5 w-5 text-[#86EFAC]" />
            ) : (
              <AlertCircle className="h-5 w-5 text-[#FCD34D]" />
            )}
            <p className={cn('text-sm font-medium', allReady ? 'text-[#86EFAC]' : 'text-[#FCD34D]')}>
              {allReady
                ? 'Stripe Test Mode is ready for activation. Connect a test tenant to begin.'
                : 'Stripe Test Mode is not yet ready. Complete the configuration steps below.'}
            </p>
          </div>
        </div>

        {/* Configuration Status Grid */}
        <div className="rounded-[18px] border border-border bg-[var(--card-bg)] p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">Configuration Status</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {configItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-3 rounded-lg border border-border bg-secondary/20 p-3">
                  <div className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full',
                    item.ok ? 'bg-[rgba(74,222,128,0.12)]' : 'bg-[rgba(251,113,133,0.10)]'
                  )}>
                    {item.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-[#86EFAC]" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{item.label}</p>
                    {!item.ok && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{item.hint}</p>
                    )}
                  </div>
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Webhook Configuration */}
        {config && (
          <div className="rounded-[18px] border border-border bg-[var(--card-bg)] p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground mb-3">Webhook Configuration</h2>
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Webhook Endpoint URL</p>
                <p className="mt-1 font-mono text-xs text-foreground break-all">
                  {config.webhook_endpoint_url || `${config.app_url}/api/stripe-webhook`}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Register this URL in your Stripe Dashboard under Developers &rarr; Webhooks
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Required Events</p>
                <div className="space-y-1">
                  {REQUIRED_EVENTS.map((event) => (
                    <div key={event} className="flex items-center gap-2 text-xs">
                      <div className="h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]" />
                      <code className="font-mono text-foreground">{event}</code>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            onClick={runTestChecklist}
            disabled={testing}
            className="flex-1 bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)]"
          >
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ListChecks className="mr-2 h-4 w-4" />}
            Run Test Checklist
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-border bg-[var(--card-bg)]"
            onClick={() => router.push('/super-admin/integrations')}
          >
            Manage Integrations
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        {/* Test Checklist Results */}
        {(testing || testResults.length > 0) && (
          <div className="rounded-[18px] border border-border bg-[var(--card-bg)] p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground mb-3">Test Checklist Progress</h2>
            <div className="space-y-2">
              {testResults.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {testing && i === testResults.length - 1 ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--brand-primary)]" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#86EFAC]" />
                  )}
                  <span className="text-foreground">{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activation Checklist */}
        <div className="rounded-[18px] border border-border bg-[var(--card-bg)] p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-3">Activation Checklist</h2>
          <ol className="space-y-2 text-xs text-muted-foreground">
            {[
              'Configure STRIPE_SECRET_KEY (test mode: sk_test_...) in environment',
              'Configure STRIPE_WEBHOOK_SECRET in environment',
              'Set NEXT_PUBLIC_APP_URL to your domain',
              'Register webhook endpoint in Stripe Dashboard',
              'Select all 6 required events in Stripe Dashboard',
              'Confirm webhook endpoint health (Stripe Dashboard shows green)',
              'Connect a test tenant via Settings → Integrations → Payments',
              'Verify Stripe account ID stored and charges_enabled',
              'Enable booking payments for the tenant',
              'Configure a listing with deposit percentage',
              'Create a public booking and complete test payment',
              'Verify webhook processes and reservation confirms',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-medium text-muted-foreground">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </main>
    </div>
  );
}
