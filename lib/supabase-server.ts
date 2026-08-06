import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cachedAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing required server environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set. Check your Vercel project settings under Settings > Environment Variables.',
    );
  }

  cachedAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cachedAdmin;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return Reflect.get(getSupabaseAdmin(), prop);
  },
});
