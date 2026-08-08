import { NextResponse } from 'next/server';

const CRON_SECRET = process.env.CRON_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!SUPABASE_URL) {
    return NextResponse.json({ error: 'Missing SUPABASE_URL' }, { status: 500 });
  }

  const results: Record<string, unknown> = {};

  const functions = ['process-workflows', 'expire-holds'];

  for (const fn of functions) {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': CRON_SECRET || '',
        },
        signal: AbortSignal.timeout(55000),
      });

      const data = await response.json().catch(() => ({}));
      results[fn] = { status: response.status, ...data };
    } catch (err) {
      results[fn] = { error: err instanceof Error ? err.message : 'Failed' };
    }
  }

  return NextResponse.json({ results, timestamp: new Date().toISOString() });
}
