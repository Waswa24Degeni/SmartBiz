import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { clearStoredAuthSession, supabase, getLastActivity, updateLastActivity } from '../lib/supabase';
import { User, Business, Subscription } from '../types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  business: Business | null;
  subscription: Subscription | null;
  businesses: Business[];
  loading: boolean;
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string, metadata?: Record<string, any>) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  switchBusiness: (businessId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  // Tracks whether an in-flight profile fetch is happening after signIn
  const [profileLoading, setProfileLoading] = useState(false);

  const isRefreshTokenError = (err: unknown): boolean => {
    const msg = String((err as any)?.message ?? err ?? '').toLowerCase();
    return msg.includes('invalid refresh token') || msg.includes('refresh token not found');
  };

  const recoverFromInvalidSession = async (reason?: unknown, showMessage = false) => {
    console.warn('[AuthContext] Recovering from invalid session token:', reason);
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Ignore sign-out errors during recovery.
    }
    try {
      await clearStoredAuthSession();
    } catch (cleanupErr) {
      console.warn('[AuthContext] Failed to clear auth storage:', cleanupErr);
    }
    setSession(null);
    setUser(null);
    setBusiness(null);
    setBusinesses([]);
    setSubscription(null);
    setProfileLoading(false);
    setLoading(false);

    if (showMessage) {
      Alert.alert('Session Expired', 'Your session has expired due to inactivity. Please sign in again.');
    }
  };

  const checkInactivity = async (): Promise<boolean> => {
    try {
      const lastActivityStr = await getLastActivity();
      if (lastActivityStr) {
        const lastActivityDate = new Date(lastActivityStr);
        const now = new Date();
        const diffMs = now.getTime() - lastActivityDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays > 30) {
          await recoverFromInvalidSession('Inactivity timeout', true);
          return true; // Session is invalid
        }
      }
      // Valid session, update activity
      await updateLastActivity();
      return false;
    } catch (e) {
      console.warn('Failed to check inactivity', e);
      return false;
    }
  };

  useEffect(() => {
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (session) {
          const isInactive = await checkInactivity();
          if (isInactive) return;

          setSession(session);
          setProfileLoading(true);
          fetchUserProfile(session.user);
        } else {
          setLoading(false);
        }
      })
      .catch((e: any) => {
        console.error('[AuthContext] getSession failed:', e?.message ?? e);
        if (isRefreshTokenError(e)) {
          recoverFromInvalidSession(e);
          return;
        }
        setLoading(false);
        setProfileLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setBusiness(null);
        setBusinesses([]);
        setSubscription(null);
        setProfileLoading(false);
        setLoading(false);
        return;
      }

      setSession(session);
      if (session) {
        setProfileLoading(true);
        fetchUserProfile(session.user);
      } else {
        setUser(null);
        setBusiness(null);
        setBusinesses([]);
        setSubscription(null);
        setProfileLoading(false);
        setLoading(false);
      }
    });

    const appStateSubscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active' && session) {
        await checkInactivity();
      }
    });

    return () => {
      subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!loading && !profileLoading) return;
    const timeout = setTimeout(() => {
      console.warn('[AuthContext] auth loading timeout fallback triggered');
      setLoading(false);
      setProfileLoading(false);
    }, 15000);
    return () => clearTimeout(timeout);
  }, [loading, profileLoading]);

  const fetchUserProfile = async (supabaseUser: SupabaseUser) => {
    try {
      // ── Step 1: resolve the profile row ────────────────────────────────────
      // We use a single `resolvedProfile` variable so the business-fetch code
      // at the bottom always runs, regardless of which path found the profile.
      let resolvedProfile: Record<string, any> | null = null;

      const { data: profileById, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', supabaseUser.id)
        .maybeSingle();

      if (error) {
        console.error('Profile fetch error:', error.message, error.code);
        Alert.alert(
          'Profile Error',
          `Could not load your profile (${error.code}).\n${error.message}`,
          [{ text: 'OK' }]
        );
        await supabase.auth.signOut({ scope: 'local' });
        return;
      }

      if (profileById) {
        resolvedProfile = profileById;
      } else {
        // id-drift: fix-auth.sql created a new auth UUID but the old
        // public.users row still has the previous id.
        const emailLower = (supabaseUser.email ?? '').toLowerCase();
        const inferredRole = emailLower === 'admin@smartbiz.tz' ? 'admin' : 'owner';
        const fallbackName =
          supabaseUser.user_metadata?.full_name ??
          supabaseUser.email?.split('@')[0] ??
          'User';

        const { data: existingByEmail } = await supabase
          .from('users')
          .select('*')
          .eq('email', supabaseUser.email ?? '')
          .maybeSingle();

        if (existingByEmail) {
          // Sync the stored id to the current auth id
          const { data: updated, error: updateErr } = await supabase
            .from('users')
            .update({ id: supabaseUser.id, updated_at: new Date().toISOString() })
            .eq('email', supabaseUser.email ?? '')
            .select()
            .maybeSingle();
          if (updateErr) {
            console.warn('Id sync failed, using existing profile:', updateErr.message);
          }
          // Use the updated row; fall back to the pre-update row (still has business_id)
          resolvedProfile = updated ?? existingByEmail;
        } else {
          // Completely new user — insert a fresh profile
          const { data: created, error: insertErr } = await supabase
            .from('users')
            .insert({
              id: supabaseUser.id,
              email: supabaseUser.email,
              full_name: fallbackName,
              role: inferredRole,
            })
            .select()
            .maybeSingle();

          if (insertErr) {
            if (insertErr.code === '23505') {
              // Race condition — another request already inserted the row
              const { data: raceProfile } = await supabase
                .from('users')
                .select('*')
                .eq('email', supabaseUser.email ?? '')
                .maybeSingle();
              resolvedProfile = raceProfile ?? null;
            } else {
              console.error('Profile insert error:', insertErr.message, insertErr.code);
              Alert.alert(
                'Setup Error',
                `Failed to create your profile (${insertErr.code}).\n${insertErr.message}\n\nRun scripts/fix-auth.sql in Supabase SQL Editor.`
              );
              await supabase.auth.signOut({ scope: 'local' });
              return;
            }
          } else {
            resolvedProfile = created;
          }
        }
      }

      if (!resolvedProfile) return;

      // ── Step 2: auto-correct admin role if the trigger set it wrong ────────
      if (resolvedProfile.email === 'admin@smartbiz.tz' && resolvedProfile.role !== 'admin') {
        const { data: fixed } = await supabase
          .from('users')
          .update({ role: 'admin' })
          .eq('id', resolvedProfile.id)
          .select()
          .maybeSingle();
        if (fixed) resolvedProfile = fixed;
      }

      setUser(resolvedProfile as User);

      // ── Step 3: fetch the associated business (admins never have one) ──────
      // resolvedProfile is guaranteed non-null here (guarded above by `if (!resolvedProfile) return`)
      const p = resolvedProfile!;
      if (p.role !== 'admin') {
        let resolvedBiz: Record<string, any> | null = null;

        if (p.role === 'owner') {
          // Owners can have multiple businesses
          const { data: allBiz, error: allBizErr } = await supabase
            .from('businesses')
            .select('*')
            .eq('owner_id', supabaseUser.id)
            .order('created_at', { ascending: false });

          if (allBizErr) {
            console.error('[AuthContext] business fetch error:', allBizErr.message, allBizErr.code);
          }

          const ownerBusinesses = (allBiz as Business[]) || [];
          setBusinesses(ownerBusinesses);

          if (ownerBusinesses.length > 0) {
            resolvedBiz = ownerBusinesses.find(b => b.id === p.business_id) || ownerBusinesses[0];
            setBusiness(resolvedBiz as Business);

            // Patch users.business_id if it's missing or out of sync
            if (!p.business_id || p.business_id !== resolvedBiz.id) {
              supabase.from('users')
                .update({ business_id: resolvedBiz.id })
                .eq('id', supabaseUser.id)
                .then(() => {});
            }
          }
        } else {
          // Staff only have one assigned business
          setBusinesses([]);
          if (p.business_id) {
            const { data: bizById, error: bizByIdErr } = await supabase
              .from('businesses')
              .select('*')
              .eq('id', p.business_id)
              .maybeSingle();
            if (bizByIdErr) {
              console.error('[AuthContext] business fallback fetch error:', bizByIdErr.message, bizByIdErr.code);
            }
            if (bizById) { setBusiness(bizById as Business); resolvedBiz = bizById; }
          } else {
            console.warn('[AuthContext] No business found for staff. profile.business_id=', p.business_id);
          }
        }

        // ── Step 4: load subscription (gates dashboard access) ────────────────
        if (resolvedBiz) {
          const { data: sub } = await supabase
            .from('subscriptions')
            .select('id, business_id, plan, status, billing_cycle, starts_at, expires_at, created_at')
            .eq('business_id', resolvedBiz.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          setSubscription((sub as Subscription) ?? null);
        } else {
          setSubscription(null);
        }
      }
    } catch (e: any) {
      console.error('Unexpected profile error:', e);
      Alert.alert('Unexpected Error', e?.message ?? 'Something went wrong. Check your internet connection.');
    } finally {
      setLoading(false);
      setProfileLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    if (error && isRefreshTokenError(error)) {
      await recoverFromInvalidSession(error);
      return { error: 'Your session expired. Please sign in again.' };
    }
    if (!error && data.session) {
      // On web, auth state callbacks may arrive late; set state immediately.
      setSession(data.session);
      setProfileLoading(true);
      fetchUserProfile(data.session.user);
    }
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, fullName: string, metadata?: Record<string, any>) => {
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, ...metadata } },
    });
    if (error) return { error: error.message };
    // If Supabase email confirmation is ON, data.session is null.
    // Profile will be created by the trigger (handle_new_user).
    // We also upsert here as a fallback in case the trigger isn't installed.
    if (data.user) {
      await supabase.from('users').upsert(
        { id: data.user.id, email, full_name: fullName, role: 'owner' },
        { onConflict: 'id', ignoreDuplicates: true }
      );
    }
    // If no session (email confirmation required), tell user
    if (!data.session) {
      return { error: 'Please check your email and click the confirmation link, then log in.' };
    }
    return { error: null };
  };

  const signOut = async () => {
    // scope:'local' clears the local session without hitting the global
    // /auth/v1/logout endpoint that returns 403 for non-admin callers.
    await supabase.auth.signOut({ scope: 'local' });
  };

  const refreshUser = async () => {
    if (session?.user) await fetchUserProfile(session.user);
  };

  const switchBusiness = async (businessId: string) => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase
      .from('users')
      .update({ business_id: businessId })
      .eq('id', user.id);

    if (error) {
      console.error('switchBusiness error:', error);
      Alert.alert('Error', 'Failed to switch shop.');
      setLoading(false);
      return;
    }

    await refreshUser();
  };

  return (
    <AuthContext.Provider value={{ session, user, business, businesses, subscription, loading, profileLoading, signIn, signUp, signOut, refreshUser, switchBusiness }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
