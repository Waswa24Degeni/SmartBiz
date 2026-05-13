/**
 * SettingsContext — system-wide user preferences
 *
 * Loads language, currency and active payment methods from the
 * settings table, subscribes to real-time updates, and exposes
 * a formatCurrency() helper consumed by every screen.
 *
 * Wrap the authenticated part of the app with <SettingsProvider>.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

// ─────────────────────────────────────────────────────────────
// Supported options (single source of truth)
// ─────────────────────────────────────────────────────────────

export const LANGUAGES = ['English', 'Kiswahili'] as const;
export type AppLanguage = typeof LANGUAGES[number];

export const CURRENCIES = [
  { code: 'TZS', name: 'Tanzanian Shilling' },
  { code: 'UGX', name: 'Ugandan Shilling'   },
  { code: 'KES', name: 'Kenyan Shilling'     },
] as const;
export type AppCurrency = typeof CURRENCIES[number]['code'];

// ─────────────────────────────────────────────────────────────
// Context shape
// ─────────────────────────────────────────────────────────────

interface SettingsValue {
  language:             AppLanguage;
  currency:             AppCurrency;
  payMethodMobileMoney: boolean;
  payMethodCash:        boolean;
  /** Formats a number as "TZS 12,500" (currency prefix) */
  formatCurrency:       (amount: number) => string;
}

const defaults: SettingsValue = {
  language:             'English',
  currency:             'TZS',
  payMethodMobileMoney: true,
  payMethodCash:        true,
  formatCurrency:       (n) => `TZS ${n.toLocaleString()}`,
};

const SettingsCtx = createContext<SettingsValue>(defaults);

// ─────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { business } = useAuth();

  const [language,             setLanguage]             = useState<AppLanguage>('English');
  const [currency,             setCurrency]             = useState<AppCurrency>('TZS');
  const [payMethodMobileMoney, setPayMethodMobileMoney] = useState(true);
  const [payMethodCash,        setPayMethodCash]        = useState(true);

  // ── Initial load ────────────────────────────────────────────
  useEffect(() => {
    if (!business?.id) return;

    supabase
      .from('settings')
      .select('language, currency, payment_bank_card, payment_cash')
      .eq('business_id', business.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setLanguage((data.language as AppLanguage)  ?? 'English');
        setCurrency((data.currency as AppCurrency)  ?? 'TZS');
        // payment_bank_card column doubles as the "Mobile Money" toggle
        setPayMethodMobileMoney(!!data.payment_bank_card);
        setPayMethodCash(!!data.payment_cash);
      });
  }, [business?.id]);

  // ── Real-time subscription ───────────────────────────────────
  useEffect(() => {
    if (!business?.id) return;

    const ch = supabase
      .channel(`sys-settings:${business.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'settings',
        filter: `business_id=eq.${business.id}`,
      }, (payload) => {
        const d = (payload as any).new;
        if (!d) return;
        setLanguage((d.language  as AppLanguage) ?? 'English');
        setCurrency((d.currency  as AppCurrency) ?? 'TZS');
        setPayMethodMobileMoney(!!d.payment_bank_card);
        setPayMethodCash(!!d.payment_cash);
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [business?.id]);

  const formatCurrency = (amount: number) =>
    `${currency} ${amount.toLocaleString()}`;

  return (
    <SettingsCtx.Provider
      value={{ language, currency, payMethodMobileMoney, payMethodCash, formatCurrency }}
    >
      {children}
    </SettingsCtx.Provider>
  );
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useSettings() {
  return useContext(SettingsCtx);
}
