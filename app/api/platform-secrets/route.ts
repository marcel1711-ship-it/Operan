import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/integrations/super-admin-auth';
import { setPlatformSecret, listProviderSecrets, deletePlatformSecret, logAudit } from '@/lib/integrations/platform-secret-service';

// GET /api/platform-secrets?provider=stripe&environment=production
// Returns masked metadata only — never plaintext
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const providerKey = req.nextUrl.searchParams.get('provider');
  const environment = req.nextUrl.searchParams.get('environment') || 'production';

  if (!providerKey) {
    return NextResponse.json({ error: 'provider parameter is required' }, { status: 400 });
  }

  const secrets = await listProviderSecrets(providerKey, environment);
  return NextResponse.json({ provider: providerKey, secrets });
}

// POST /api/platform-secrets
// Body: { providerKey, secretName, value, environment? }
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { userId: string; email: string };

  const body = await req.json().catch(() => ({}));
  const { providerKey, secretName, value, environment } = body as {
    providerKey: string; secretName: string; value: string; environment?: string;
  };

  if (!providerKey || !secretName || !value) {
    return NextResponse.json({ error: 'providerKey, secretName, and value are required' }, { status: 400 });
  }

  const result = await setPlatformSecret({
    providerKey,
    secretName,
    plaintextValue: value,
    environment: environment || 'production',
    configuredBy: ctx.userId,
    actorEmail: ctx.email,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/platform-secrets
// Body: { providerKey, secretName, environment? }
export async function DELETE(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { userId: string; email: string };

  const body = await req.json().catch(() => ({}));
  const { providerKey, secretName, environment } = body as {
    providerKey: string; secretName: string; environment?: string;
  };

  if (!providerKey || !secretName) {
    return NextResponse.json({ error: 'providerKey and secretName are required' }, { status: 400 });
  }

  const result = await deletePlatformSecret({
    providerKey,
    secretName,
    environment: environment || 'production',
    actorId: ctx.userId,
    actorEmail: ctx.email,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
