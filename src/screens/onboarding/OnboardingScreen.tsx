import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { generateIdempotencyKey } from '../../lib/snippe';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { COLORS, SPACING, FONTS, RADIUS } from '../../lib/constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

const PLANS: { id: string; name: string; priceLabel: string; numericPrice: number; color: string; icon: string; features: string[] }[] = [
  { id: 'free',     name: 'Free',     priceLabel: 'TZS 0',        numericPrice: 0,     color: '#6B7280', icon: 'gift-outline',     features: ['1 user', '100 products', 'Basic reports'] },
  { id: 'starter',  name: 'Starter',  priceLabel: 'TZS 15,000',  numericPrice: 15000, color: '#3B82F6', icon: 'rocket-outline',   features: ['3 users', '500 products', 'Advanced reports'] },
  { id: 'business', name: 'Business', priceLabel: 'TZS 35,000',  numericPrice: 35000, color: '#C49A2A', icon: 'briefcase-outline', features: ['10 users', 'Unlimited products', 'Priority support'] },
  { id: 'premium',  name: 'Premium',  priceLabel: 'TZS 80,000',  numericPrice: 80000, color: '#1B3A2D', icon: 'diamond-outline',   features: ['Unlimited users', 'API access', 'Dedicated manager'] },
];

type Step = 'profile' | 'category' | 'currency' | 'plan' | 'payment';

export function OnboardingScreen() {
  const { user, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('profile');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [currency, setCurrency] = useState('TZS');
  const [selectedPlanId, setSelectedPlanId] = useState('free');
  const [payerPhone, setPayerPhone] = useState('');
  const [payPhoneError, setPayPhoneError] = useState('');
  const [payStep, setPayStep] = useState<'idle' | 'paying' | 'done'>('idle');
  const [loading, setLoading] = useState(false);

  const isPaidPlan = selectedPlanId !== 'free';
  const STEPS: Step[] = isPaidPlan
    ? ['profile', 'category', 'currency', 'plan', 'payment']
    : ['profile', 'category', 'currency', 'plan'];
  const stepIndex = STEPS.indexOf(step);

  // ── Free plan: create business + active subscription ────
  const handleFinish = async () => {
    if (!businessName.trim()) {
      Alert.alert('Required', 'Business name is required');
      return;
    }
    setLoading(true);
    try {
      const effectiveCategory = category === 'Other'
        ? (customCategory.trim() || 'Other')
        : category;

      const { data: biz, error } = await supabase
        .from('businesses')
        .insert({
          name: businessName.trim(),
          category: effectiveCategory,
          owner_id: user!.id,
          phone,
          address,
          currency,
          is_verified: false,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from('users').update({ business_id: biz.id }).eq('id', user!.id);

      await supabase.from('subscriptions').insert({
        business_id: biz.id,
        plan: 'free',
        status: 'active',
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        billing_cycle: 'monthly',
      });

      await refreshUser();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Plan step: free → handleFinish, paid → payment step ─
  const handlePlanNext = () => {
    if (!isPaidPlan) {
      handleFinish();
    } else {
      setPayerPhone(phone); // pre-fill from profile phone
      setStep('payment');
    }
  };

  // ── Paid plan: create business + initiate Snippe payment ─
  const handleInitiatePay = async () => {
    const normalized = payerPhone.trim().replace(/\s/g, '');
    if (!normalized || normalized.length < 9) {
      setPayPhoneError('Enter a valid mobile money number (e.g. 0712345678)');
      return;
    }
    if (!businessName.trim()) {
      Alert.alert('Required', 'Business name is required. Go back to step 1.');
      return;
    }
    setPayPhoneError('');
    setPayStep('paying');

    try {
      const effectiveCategory = category === 'Other'
        ? (customCategory.trim() || 'Other')
        : category;

      const { data: biz, error: bizErr } = await supabase
        .from('businesses')
        .insert({
          name: businessName.trim(),
          category: effectiveCategory,
          owner_id: user!.id,
          phone,
          address,
          currency,
          is_verified: false,
        })
        .select()
        .single();

      if (bizErr) throw bizErr;

      await supabase.from('users').update({ business_id: biz.id }).eq('id', user!.id);

      const selectedPlan = PLANS.find(p => p.id === selectedPlanId)!;

      const { data: payResult, error: payErr } = await supabase.functions.invoke(
        'initiate-payment',
        {
          body: {
            payment_type:    'subscription',
            channel:         'mobile',
            amount:          selectedPlan.numericPrice,
            business_id:     biz.id,
            idempotency_key: generateIdempotencyKey('onb'),
            payer_phone:     normalized,
            payer_name:      user?.full_name || undefined,
            metadata: { plan: selectedPlanId },
          },
        },
      );

      if (payErr || !(payResult as any)?.success) {
        Alert.alert(
          'Payment Failed',
          (payResult as any)?.message ?? payErr?.message ?? 'Could not initiate payment.',
        );
        setPayStep('idle');
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

      setPayStep('done');
    } catch (e: any) {
      setPayStep('idle');
      Alert.alert('Error', e?.message ?? 'Something went wrong.');
    }
  };


  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Progress */}
      <View style={styles.progressWrap}>
        <TouchableOpacity onPress={() => stepIndex > 0 && setStep(STEPS[stepIndex - 1])}>
          {stepIndex > 0 ? <Ionicons name="arrow-back" size={24} color={COLORS.text} /> : <View style={{ width: 24 }} />}
        </TouchableOpacity>
        <View style={styles.steps}>
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={[styles.stepDot, i <= stepIndex && styles.stepDotActive]}
            />
          ))}
        </View>
        <Text style={styles.stepCount}>{stepIndex + 1}/{STEPS.length}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'profile' && (
          <View>
            <Text style={styles.stepTitle}>Set up your business</Text>
            <Text style={styles.stepSubtitle}>Tell us about your business</Text>
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
            <Button title="Continue" onPress={() => setStep('currency')} fullWidth size="lg" />
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
            <Button title="Continue" onPress={() => setStep('plan')} fullWidth size="lg" style={{ marginTop: 16 }} />
          </View>
        )}

        {step === 'plan' && (
          <View>
            <Text style={styles.stepTitle}>Choose your plan</Text>
            <Text style={styles.stepSubtitle}>Free plan included — upgrade anytime</Text>

            {PLANS.map(plan => {
              const selected = selectedPlanId === plan.id;
              return (
                <TouchableOpacity
                  key={plan.id}
                  style={[styles.planCard, { borderLeftColor: plan.color }, selected && styles.planCardSelected]}
                  onPress={() => setSelectedPlanId(plan.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.planIconWrap, { backgroundColor: plan.color + '20' }]}>
                    <Ionicons name={plan.icon as any} size={22} color={plan.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planPrice}>{plan.priceLabel}{plan.numericPrice > 0 ? '/mo' : ''}</Text>
                    <Text style={styles.planFeatures}>{plan.features.join(' · ')}</Text>
                  </View>
                  {selected && (
                    <Ionicons name="checkmark-circle" size={22} color={plan.color} />
                  )}
                </TouchableOpacity>
              );
            })}

            {isPaidPlan && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs,
                backgroundColor: '#EFF6FF', borderRadius: RADIUS.md, padding: SPACING.sm, marginTop: SPACING.sm }}>
                <Ionicons name="phone-portrait-outline" size={16} color={COLORS.info} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.info }}>
                  Payment via mobile money (USSD push). You will be prompted to enter your PIN.
                </Text>
              </View>
            )}

            <Button
              title={isPaidPlan ? `Pay ${PLANS.find(p => p.id === selectedPlanId)?.priceLabel} →` : 'Get Started →'}
              onPress={handlePlanNext}
              loading={loading && !isPaidPlan}
              fullWidth
              size="lg"
              style={{ marginTop: 16 }}
            />
          </View>
        )}

        {step === 'payment' && (
          <View>
            {payStep === 'done' ? (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="checkmark-circle" size={64} color={COLORS.success} style={{ marginBottom: SPACING.md }} />
                <Text style={[styles.stepTitle, { textAlign: 'center' }]}>USSD Push Sent!</Text>
                <Text style={[styles.stepSubtitle, { textAlign: 'center' }]}>
                  Check your phone and enter your mobile money PIN to activate your{' '}
                  {PLANS.find(p => p.id === selectedPlanId)?.name} plan.
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs,
                  backgroundColor: '#F0FDF4', borderRadius: RADIUS.md, padding: SPACING.md,
                  marginBottom: SPACING.xl, borderWidth: 1, borderColor: COLORS.success + '40' }}>
                  <Ionicons name="information-circle-outline" size={16} color={COLORS.success} style={{ marginTop: 2 }} />
                  <Text style={{ flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.success }}>
                    Your dashboard will unlock automatically once payment is confirmed by the system.
                  </Text>
                </View>
                <Button
                  title="Check Payment Status"
                  onPress={refreshUser}
                  fullWidth size="lg"
                />
              </View>
            ) : (
              <View>
                <Text style={styles.stepTitle}>Complete Payment</Text>
                <Text style={styles.stepSubtitle}>
                  Pay {PLANS.find(p => p.id === selectedPlanId)?.priceLabel} via mobile money to activate your plan
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
                  title={payStep === 'paying' ? 'Sending USSD push…' : `Pay ${PLANS.find(p => p.id === selectedPlanId)?.priceLabel}`}
                  onPress={handleInitiatePay}
                  loading={payStep === 'paying'}
                  fullWidth size="lg"
                  style={{ marginTop: SPACING.sm }}
                />
                <TouchableOpacity
                  style={{ alignItems: 'center', marginTop: SPACING.md }}
                  onPress={() => setStep('plan')}
                  disabled={payStep === 'paying'}
                >
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm }}>← Back to plans</Text>
                </TouchableOpacity>
              </View>
            )}
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
  currencyText: { fontSize: FONTS.sizes.md, color: COLORS.text },
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
  badge: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: { color: COLORS.white, fontSize: FONTS.sizes.xs, fontWeight: '600' },
});
