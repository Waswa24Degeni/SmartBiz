import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { generateIdempotencyKey } from '../../lib/snippe';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { COLORS, SPACING, FONTS, RADIUS } from '../../lib/constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSubscriptionPlans } from '../../lib/hooks';

const CATEGORIES: { label: string; icon: string }[] = [
  { label: 'Pharmacy',           icon: 'medkit-outline' },
  { label: 'Foods & Restaurant', icon: 'restaurant-outline' },
  { label: 'Electronics',        icon: 'hardware-chip-outline' },
  { label: 'Beauty & Cosmetic',  icon: 'cut-outline' },
  { label: 'Other',              icon: 'apps-outline' },
];

const CURRENCIES: { code: string; flag: string; name: string }[] = [
  { code: 'TZS', flag: 'Tanzania',  name: 'Tanzanian Shilling' },
  { code: 'USD', flag: 'USA',       name: 'US Dollar' },
  { code: 'KES', flag: 'Kenya',     name: 'Kenyan Shilling' },
  { code: 'UGX', flag: 'Uganda',    name: 'Ugandan Shilling' },
  { code: 'EUR', flag: 'Europe',    name: 'Euro' },
  { code: 'GBP', flag: 'UK',        name: 'British Pound' },
];

const PLAN_ICONS: Record<string, string> = {
  free: 'gift-outline',
  starter: 'rocket-outline',
  business: 'briefcase-outline',
  premium: 'diamond-outline',
};

function normalizeTzPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('255') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `255${digits.slice(1)}`;
  if (digits.length === 9) return `255${digits}`;
  return digits;
}

function isValidTzPhone(raw: string): boolean {
  return /^255\d{9}$/.test(normalizeTzPhone(raw));
}

type Step = 'plan' | 'payment' | 'profile' | 'category' | 'currency';

export function OnboardingScreen() {
  const { user, session, business, subscription, refreshUser, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const { plans: PLANS, loading: plansLoading } = useSubscriptionPlans();
  
  // If they already have a business created, they are in the setup phase.
  const [step, setStep] = useState<Step>(business ? 'profile' : 'plan');
  
  // Setup fields
  const [businessName, setBusinessName] = useState(business?.name || session?.user?.user_metadata?.business_name || '');
  const [phone, setPhone] = useState(business?.phone || '');
  const [address, setAddress] = useState(business?.address || '');
  const [category, setCategory] = useState(business?.category === 'SETUP_PENDING' ? '' : (business?.category || ''));
  const [customCategory, setCustomCategory] = useState('');
  const [currency, setCurrency] = useState(business?.currency || 'TZS');
  
  // Plan/Payment fields
  const [selectedPlanId, setSelectedPlanId] = useState('free');
  const [payerPhone, setPayerPhone] = useState('');
  const [payPhoneError, setPayPhoneError] = useState('');
  const [loading, setLoading] = useState(false);

  // Re-sync step if auth state changes externally (e.g. after payment pending resolves)
  useEffect(() => {
    if (business && subscription?.status === 'active' && (step === 'plan' || step === 'payment')) {
      setStep('profile');
    }
  }, [business, subscription, step]);

  const STEPS: Step[] = business 
    ? ['profile', 'category', 'currency']
    : (selectedPlanId === 'free' ? ['plan', 'profile', 'category', 'currency'] : ['plan', 'payment', 'profile', 'category', 'currency']);
    
  const stepIndex = STEPS.indexOf(step);

  // ── Plan Step ──────────────────────────────────────────────
  const handlePlanNext = async () => {
    const cleanBusinessName = businessName.trim() || 'My Business';
    setLoading(true);
    try {
      if (selectedPlanId === 'free') {
        const { data: biz, error } = await supabase
          .from('businesses')
          .insert({
            name: cleanBusinessName,
            category: 'SETUP_PENDING',
            owner_id: user!.id,
            is_verified: false,
          })
          .select()
          .single();

        if (error) throw error;
        const { error: userErr } = await supabase.from('users').update({ business_id: biz.id }).eq('id', user!.id);
        if (userErr) throw userErr;

        await supabase.from('subscriptions').insert({
          business_id: biz.id,
          plan: 'free',
          status: 'active',
          starts_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          billing_cycle: 'monthly',
        });

        await refreshUser();
      } else {
        setStep('payment');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Payment Step ───────────────────────────────────────────
  const handleInitiatePay = async () => {
    const normalized = normalizeTzPhone(payerPhone);
    if (!isValidTzPhone(normalized)) {
      setPayPhoneError('Enter a valid mobile money number (e.g. 0712345678)');
      return;
    }
    setPayPhoneError('');
    setLoading(true);

    try {
      const cleanBusinessName = businessName.trim() || 'My Business';
      const { data: biz, error: bizErr } = await supabase
        .from('businesses')
        .insert({
          name: cleanBusinessName,
          category: 'SETUP_PENDING',
          owner_id: user!.id,
          is_verified: false,
        })
        .select()
        .single();

      if (bizErr) throw bizErr;
      const { error: userErr } = await supabase.from('users').update({ business_id: biz.id }).eq('id', user!.id);
      if (userErr) throw userErr;

      const selectedPlan = PLANS.find(p => p.id === selectedPlanId)!;
      const payerName = user?.full_name?.trim() || 'Customer';

      const { data: payResult, error: payErr } = await supabase.functions.invoke(
        'initiate-payment',
        {
          body: {
            payment_type:    'subscription',
            channel:         'mobile',
            amount:          selectedPlan.price,
            business_id:     biz.id,
            idempotency_key: generateIdempotencyKey('sub'),
            payer_phone:     normalized,
            payer_name:      payerName,
            payer_email:     user?.email,
            metadata:        { plan: selectedPlanId },
          },
        },
      );

      if (payErr || !(payResult as any)?.success) {
        Alert.alert('Payment Failed', (payResult as any)?.message ?? payErr?.message ?? 'Could not initiate payment.');
        setLoading(false);
        return;
      }

      const pid = (payResult as any).payment_id ?? null;
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      const { data: sub } = await supabase
        .from('subscriptions')
        .insert({
          business_id:   biz.id,
          plan:          selectedPlanId,
          status:        'pending',
          billing_cycle: 'monthly',
          starts_at:     now.toISOString(),
          expires_at:    expiresAt.toISOString(),
        })
        .select('id')
        .single();

      if (pid && sub) {
        await supabase.from('payments').update({ subscription_id: sub.id }).eq('id', pid);
      }

      await refreshUser();
    } catch (e: any) {
      setLoading(false);
      Alert.alert('Error', e?.message ?? 'Something went wrong.');
    }
  };

  // ── Setup Steps ────────────────────────────────────────────
  const handleFinishSetup = async () => {
    if (!business) return;
    setLoading(true);
    try {
      const effectiveCategory = category === 'Other'
        ? (customCategory.trim() || 'Other')
        : category;

      const { error } = await supabase
        .from('businesses')
        .update({
          name: businessName.trim(),
          phone,
          address,
          category: effectiveCategory,
          currency,
        })
        .eq('id', business.id);

      if (error) throw error;
      await refreshUser();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Render Helpers ─────────────────────────────────────────
  const handleBack = () => {
    if (stepIndex > 0) {
      setStep(STEPS[stepIndex - 1]);
    } else {
      signOut();
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Progress */}
      <View style={styles.progressWrap}>
        <TouchableOpacity onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.steps}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.stepDot, i <= stepIndex && styles.stepDotActive]} />
          ))}
        </View>
        <Text style={styles.stepCount}>{stepIndex + 1}/{STEPS.length}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        
        {step === 'plan' && (
          <View>
            <Text style={styles.stepTitle}>Choose your plan</Text>
            <Text style={styles.stepSubtitle}>Select a plan to start your business</Text>

            {plansLoading ? <Text style={styles.stepSubtitle}>Loading plans...</Text> : PLANS.map(plan => {
              const selected = selectedPlanId === plan.id;
              const iconName = PLAN_ICONS[plan.id] || 'star-outline';
              return (
                <TouchableOpacity
                  key={plan.id}
                  style={[styles.planCard, { borderLeftColor: plan.color }, selected && styles.planCardSelected]}
                  onPress={() => setSelectedPlanId(plan.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.planIconWrap, { backgroundColor: (plan as any).color + '20' }]}>
                    <Ionicons name={iconName as any} size={22} color={plan.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planPrice}>{plan.price === 0 ? 'Free' : `TZS ${plan.price.toLocaleString()}/mo`}</Text>
                    {plan.features.map((feature: string) => (
                       <View key={feature} style={{flexDirection: 'row', alignItems: 'center', marginTop: 2}}>
                         <Ionicons name="checkmark-circle" size={12} color={COLORS.success} style={{marginRight: 4}} />
                         <Text style={styles.planFeatures}>{feature}</Text>
                       </View>
                    ))}
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={22} color={plan.color} />}
                </TouchableOpacity>
              );
            })}

            <Button
              title="Continue →"
              onPress={handlePlanNext}
              loading={loading}
              fullWidth
              size="lg"
              style={{ marginTop: 16 }}
            />
          </View>
        )}

        {step === 'payment' && (
          <View>
            <Text style={styles.stepTitle}>Complete Payment</Text>
            <Text style={styles.stepSubtitle}>
              Pay {PLANS.find(p => p.id === selectedPlanId)?.price === 0 ? 'TZS 0' : `TZS ${PLANS.find(p => p.id === selectedPlanId)?.price?.toLocaleString()}`} via mobile money to activate your plan
            </Text>
            <Input
              label="Mobile Money Number"
              placeholder="0712 345 678"
              value={payerPhone}
              onChangeText={v => { setPayerPhone(v); setPayPhoneError(''); }}
              keyboardType="phone-pad"
              leftIcon="phone-portrait-outline"
              error={payPhoneError}
            />
            <Button
              title="Pay Now"
              onPress={handleInitiatePay}
              loading={loading}
              fullWidth size="lg"
              style={{ marginTop: SPACING.sm }}
            />
          </View>
        )}

        {step === 'profile' && (
          <View>
            <Text style={styles.stepTitle}>Business details</Text>
            <Text style={styles.stepSubtitle}>Confirm your business profile</Text>
            <Input
              label="Business Name *"
              placeholder="e.g. Mama's Restaurant"
              value={businessName}
              onChangeText={setBusinessName}
              leftIcon="business-outline"
            />
            <Input
              label="Phone Number"
              placeholder="+255 700 000 000"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              leftIcon="call-outline"
            />
            <Input
              label="Address"
              placeholder="Street, City"
              value={address}
              onChangeText={setAddress}
              leftIcon="location-outline"
            />
            <Button
              title="Continue"
              onPress={() => setStep('category')}
              fullWidth
              size="lg"
              disabled={!businessName.trim()}
            />
          </View>
        )}

        {step === 'category' && (
          <View>
            <Text style={styles.stepTitle}>Business category</Text>
            <Text style={styles.stepSubtitle}>Select the type that best describes your POS business</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map(cat => {
                const selected = category === cat.label;
                return (
                  <TouchableOpacity
                    key={cat.label}
                    style={[styles.categoryItem, selected && styles.categoryItemSelected]}
                    onPress={() => setCategory(cat.label)}
                  >
                    <Ionicons
                      name={cat.icon as any}
                      size={28}
                      color={selected ? COLORS.accent : COLORS.textSecondary}
                      style={styles.categoryIcon}
                    />
                    <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {category === 'Other' && (
              <View style={{ marginBottom: SPACING.md }}>
                <Text style={{ fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACING.xs }}>
                  Describe your business type
                </Text>
                <TextInput
                  style={{
                    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
                    borderWidth: 1, borderColor: COLORS.accent,
                    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
                    fontSize: FONTS.sizes.base, color: COLORS.text,
                  }}
                  placeholder="e.g. Hardware Store, Bookshop…"
                  placeholderTextColor={COLORS.textMuted}
                  value={customCategory}
                  onChangeText={setCustomCategory}
                  autoFocus
                />
              </View>
            )}
            <Button title="Continue" onPress={() => setStep('currency')} fullWidth size="lg" disabled={!category} />
          </View>
        )}

        {step === 'currency' && (
          <View>
            <Text style={styles.stepTitle}>Currency settings</Text>
            <Text style={styles.stepSubtitle}>Choose your preferred currency</Text>
            {CURRENCIES.map(c => (
              <TouchableOpacity
                key={c.code}
                style={[styles.currencyItem, currency === c.code && styles.currencyItemSelected]}
                onPress={() => setCurrency(c.code)}
              >
                <View style={styles.currencyLeft}>
                  <Ionicons name="cash-outline" size={20} color={currency === c.code ? COLORS.accent : COLORS.textSecondary} style={{ marginRight: SPACING.sm }} />
                  <View>
                    <Text style={[styles.currencyCode, currency === c.code && styles.currencyTextSelected]}>{c.code}</Text>
                    <Text style={styles.currencyName}>{c.name}</Text>
                  </View>
                </View>
                {currency === c.code && <Ionicons name="checkmark-circle" size={22} color={COLORS.accent} />}
              </TouchableOpacity>
            ))}
            <Button 
              title="Complete Setup" 
              onPress={handleFinishSetup} 
              loading={loading}
              fullWidth 
              size="lg" 
              style={{ marginTop: 16 }} 
            />
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.base,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  steps: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: SPACING.sm },
  stepDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.border,
    marginHorizontal: 3,
  },
  stepDotActive: { backgroundColor: COLORS.accent },
  stepCount: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  content: { padding: SPACING.xl, paddingBottom: 40 },
  stepTitle: { fontSize: FONTS.sizes['2xl'], fontWeight: '700', color: COLORS.text, marginBottom: SPACING.xs },
  stepSubtitle: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, marginBottom: SPACING.xl },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.xl },
  categoryItem: {
    width: '47%',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  categoryItemSelected: { borderColor: COLORS.accent, backgroundColor: '#FEF3C7' },
  categoryIcon: { marginBottom: SPACING.xs },
  categoryText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, textAlign: 'center' },
  categoryTextSelected: { color: COLORS.accent, fontWeight: '600' },
  currencyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.base,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  currencyItemSelected: { borderColor: COLORS.accent },
  currencyLeft: { flexDirection: 'row', alignItems: 'center' },
  currencyCode: { fontSize: FONTS.sizes.md, fontWeight: '700', color: COLORS.text },
  currencyName: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  currencyTextSelected: { color: COLORS.accent, fontWeight: '600' },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.base,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  planCardSelected: { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '08' },
  planIconWrap: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planName: { fontSize: FONTS.sizes.md, fontWeight: '600', color: COLORS.text },
  planPrice: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  planFeatures: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 2 },
});
