'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type UserRole = 'super_admin' | 'tenant_admin' | null;

type TenantInfo = {
  id: string;
  name: string;
  slug: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  template: string;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  role: UserRole;
  tenant: TenantInfo | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null; role: UserRole }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  role: null,
  tenant: null,
  loading: true,
  signIn: async () => ({ error: null, role: null }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserRole = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('tenant_users')
      .select('role, tenant_id, tenants(id, name, slug, primary_color, secondary_color, logo_url, template)')
      .eq('user_id', uid)
      .maybeSingle();

    if (error || !data) {
      setRole(null);
      setTenant(null);
      return null;
    }

    const r = data.role as UserRole;
    setRole(r);
    if (data.tenants) {
      const t = data.tenants as unknown as TenantInfo;
      setTenant(t);
    }
    return r;
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      setSession(data.session);
      setUser(data.session?.user ?? null);

      if (data.session?.user) {
        await fetchUserRole(data.session.user.id);
      }
      setLoading(false);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      (async () => {
        if (!mounted) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          await fetchUserRole(newSession.user.id);
        } else {
          setRole(null);
          setTenant(null);
        }
        setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [fetchUserRole]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message, role: null };

    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      const r = await fetchUserRole(userData.user.id);
      return { error: null, role: r };
    }
    return { error: null, role: null };
  }, [fetchUserRole]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setRole(null);
    setTenant(null);
    setUser(null);
    setSession(null);
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, session, role, tenant, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
