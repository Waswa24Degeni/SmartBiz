import { useEffect, useRef, useState, useCallback } from 'react';
import { useWindowDimensions } from 'react-native';
import { supabase } from './supabase';
import { BREAKPOINTS } from './constants';

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isMobile: width < BREAKPOINTS.tablet,
    isTablet: width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop,
    isDesktop: width >= BREAKPOINTS.desktop,
  };
}

/**
 * Subscribe to any Postgres change on a table and call onRefresh.
 * Uses a ref so the callback is always up-to-date without re-subscribing.
 */
export function useRealtimeSubscription(
  channelName: string,
  table: string,
  onRefresh: () => void,
  enabled = true,
) {
  const callbackRef = useRef(onRefresh);
  callbackRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () =>
        callbackRef.current(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [channelName, table, enabled]);
}

export interface PlanDef {
  id: string;
  name: string;
  price: number;
  period: string;
  color: string;
  bg_color: string;
  features: string[];
  max_businesses: number;
  max_users: number;
  max_products: number;
  is_popular: boolean;
  sort_order: number;
}

const PLAN_META: Record<string, { price: string; period: string; color: string; bgColor: string; features: string[]; popular?: boolean; sort: number }> = {
  free: {
    price: 'TZS 0', period: 'Forever', color: '#6B7280', bgColor: '#F3F4F6',
    features: ['1 Business', '1 user', '100 products', 'Basic reports', 'Mobile app'],
    max_businesses: 1, max_users: 1, max_products: 100,
    sort: 0,
  },
  starter: {
    price: 'TZS 15,000', period: '/month', color: '#3B82F6', bgColor: '#DBEAFE',
    features: ['1 Business', '3 users', '500 products', 'Advanced reports', 'Email support'],
    max_businesses: 1, max_users: 3, max_products: 500,
    sort: 1,
  },
  business: {
    price: 'TZS 35,000', period: '/month', color: '#10B981', bgColor: '#D1FAE5', popular: true,
    features: ['2 Businesses', '10 users', 'Unlimited products', 'Full analytics', 'Priority support', 'Staff management'],
    max_businesses: 2, max_users: 10, max_products: -1,
    sort: 2,
  },
  premium: {
    price: 'TZS 80,000', period: '/month', color: '#0D9488', bgColor: '#CCFBF1',
    features: ['2 Businesses', 'Unlimited users', 'Unlimited products', 'Custom reports', '24/7 support', 'API access'],
    max_businesses: 2, max_users: -1, max_products: -1,
    sort: 3,
  },
};

const PLAN_PRICE_MAP: Record<string, number> = { free: 0, starter: 15000, business: 35000, premium: 80000 };

export function useSubscriptionPlans() {
  const [plans, setPlans] = useState<PlanDef[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('sort_order', { ascending: true });

    const planOrder = ['free', 'starter', 'business', 'premium'];
    const result: PlanDef[] = [];
    
    // Seed defaults first
    for (const key of planOrder) {
      const meta = PLAN_META[key];
      if (!meta) continue;
      result.push({
        id: key,
        name: key.charAt(0).toUpperCase() + key.slice(1),
        price: PLAN_PRICE_MAP[key] ?? 0,
        period: meta.period,
        color: meta.color,
        bg_color: meta.bgColor,
        features: [...meta.features],
        max_businesses: (meta as any).max_businesses ?? 1,
        max_users: (meta as any).max_users ?? 1,
        max_products: (meta as any).max_products ?? 100,
        is_popular: meta.popular ?? false,
        sort_order: meta.sort,
      });
    }

    // Override with DB rows
    if (data && data.length > 0) {
      for (const row of data) {
        const existingIdx = result.findIndex(p => p.id === row.id);
        const def = existingIdx >= 0 ? result[existingIdx] : null;
        
        const merged: PlanDef = {
          id: row.id,
          name: row.name ?? (def?.name ?? (row.id.charAt(0).toUpperCase() + row.id.slice(1))),
          price: row.price ?? (def?.price ?? 0),
          period: row.period ?? (def?.period ?? '/month'),
          color: row.color ?? (def?.color ?? '#6B7280'),
          bg_color: row.bg_color ?? (def?.bg_color ?? '#F3F4F6'),
          features: Array.isArray(row.features) ? row.features : (def?.features ?? []),
          max_businesses: row.max_businesses ?? (def?.max_businesses ?? 1),
          max_users: row.max_users ?? (def?.max_users ?? 1),
          max_products: row.max_products ?? (def?.max_products ?? 100),
          is_popular: row.is_popular ?? (def?.is_popular ?? false),
          sort_order: row.sort_order ?? (def?.sort_order ?? 99),
        };

        if (existingIdx >= 0) {
          result[existingIdx] = merged;
        } else {
          result.push(merged);
        }
      }
      result.sort((a, b) => a.sort_order - b.sort_order);
    }

    setPlans(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  useRealtimeSubscription('public-plans', 'subscription_plans', fetchPlans);

  return { plans, loading, fetchPlans };
}
