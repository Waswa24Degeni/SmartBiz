import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { COLORS, SPACING, FONTS, RADIUS } from '../../lib/constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const CATEGORIES: { label: string; icon: string }[] = [
  { label: 'Restaurant & Food', icon: 'restaurant-outline' },
  { label: 'Retail Shop',       icon: 'storefront-outline' },
  { label: 'Salon & Beauty',    icon: 'cut-outline' },
  { label: 'Electronics',       icon: 'hardware-chip-outline' },
  { label: 'Pharmacy',          icon: 'medkit-outline' },
  { label: 'Supermarket',       icon: 'basket-outline' },
  { label: 'Hardware Store',    icon: 'build-outline' },
  { label: 'Other',             icon: 'apps-outline' },
];

const CURRENCIES: { code: string; flag: string; name: string }[] = [
  { code: 'TZS', flag: 'Tanzania',  name: 'Tanzanian Shilling' },
  { code: 'USD', flag: 'USA',       name: 'US Dollar' },
  { code: 'KES', flag: 'Kenya',     name: 'Kenyan Shilling' },
  { code: 'UGX', flag: 'Uganda',    name: 'Ugandan Shilling' },
  { code: 'EUR', flag: 'Europe',    name: 'Euro' },
  { code: 'GBP', flag: 'UK',        name: 'British Pound' },
];

const PLANS: { id: string; name: string; price: string; color: string; icon: string; features: string[] }[] = [
  { id: 'free',     name: 'Free',     price: '0 TZS/mo',       color: '#6B7280', icon: 'gift-outline',     features: ['1 user', '100 products', 'Basic reports'] },
  { id: 'starter',  name: 'Starter',  price: '15,000 TZS/mo',  color: '#3B82F6', icon: 'rocket-outline',   features: ['3 users', '500 products', 'Advanced reports'] },
  { id: 'business', name: 'Business', price: '35,000 TZS/mo',  color: '#C49A2A', icon: 'briefcase-outline', features: ['10 users', 'Unlimited products', 'Priority support'] },
  { id: 'premium',  name: 'Premium',  price: '75,000 TZS/mo',  color: '#1B3A2D', icon: 'diamond-outline',   features: ['Unlimited users', 'API access', 'Dedicated manager'] },
];

type Step = 'profile' | 'category' | 'currency' | 'plan';

export function OnboardingScreen() {
  const { user, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('profile');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState('');
  const [currency, setCurrency] = useState('TZS');
  const [loading, setLoading] = useState(false);

  const STEPS: Step[] = ['profile', 'category', 'currency', 'plan'];
  const stepIndex = STEPS.indexOf(step);

  const handleFinish = async () => {
    if (!businessName.trim()) {
      Alert.alert('Required', 'Business name is required');
      return;
    }
    setLoading(true);
    try {
      const { data: biz, error } = await supabase
        .from('businesses')
        .insert({
          name: businessName.trim(),
          category,
          owner_id: user!.id,
          phone,
          address,
          currency,
          is_verified: false,
        })
        .select()
        .single();

      if (error) throw error;

      // Link user to business
      await supabase.from('users').update({ business_id: biz.id }).eq('id', user!.id);

      // Create free subscription
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
            <Text style={styles.stepSubtitle}>Select the type that best describes your business</Text>
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
            <Text style={styles.stepSubtitle}>Start with Free plan, upgrade anytime</Text>

            {PLANS.map(plan => (
              <View key={plan.id} style={[styles.planCard, { borderLeftColor: plan.color }]}>
                <View style={[styles.planIconWrap, { backgroundColor: plan.color + '20' }]}>
                  <Ionicons name={plan.icon as any} size={22} color={plan.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planPrice}>{plan.price}</Text>
                  <Text style={styles.planFeatures}>{plan.features.join(' · ')}</Text>
                </View>
                {plan.id === 'free' && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Selected</Text>
                  </View>
                )}
              </View>
            ))}

            <Button
              title="Get Started"
              onPress={handleFinish}
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
    gap: SPACING.md,
  },
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
