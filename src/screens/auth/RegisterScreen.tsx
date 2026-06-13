import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { generateIdempotencyKey } from '../../lib/snippe';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { COLORS, SPACING, FONTS, RADIUS } from '../../lib/constants';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>;
};

// ─── Plan definitions ────────────────────────────────────────
const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    priceLabel: 'TZS 0',
    period: 'Forever',
    color: COLORS.textSecondary,
    bg: '#F3F4F6',
    icon: 'gift-outline' as const,
    features: ['1 user', '100 products', 'Basic reports', 'Mobile app'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 15000,
    priceLabel: 'TZS 15,000',
    period: '/month',
    color: COLORS.info,
    bg: COLORS.infoLight,
    icon: 'rocket-outline' as const,
    features: ['3 users', '500 products', 'Advanced reports', 'Email support'],
  },
  {
    id: 'business',
    name: 'Business',
    price: 35000,
    priceLabel: 'TZS 35,000',
    period: '/month',
    color: COLORS.success,
    bg: COLORS.successLight,
    icon: 'briefcase-outline' as const,
    popular: true,
    features: ['10 users', 'Unlimited products', 'Full analytics', 'Priority support', 'Staff management'],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 80000,
    priceLabel: 'TZS 80,000',
    period: '/month',
    color: COLORS.accent,
    bg: COLORS.warningLight,
    icon: 'diamond-outline' as const,
    features: ['Unlimited users', 'Unlimited products', 'Custom reports', '24/7 support', 'API access'],
  },
];

const MOBILE_MONEY_MIN_AMOUNT = 500;

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

function hasLetter(raw: string): boolean {
  return /[A-Za-z]/.test(raw);
}

function isValidPersonName(raw: string): boolean {
  const v = raw.trim();
  return v.length >= 3 && v.length <= 80 && hasLetter(v);
}

function isValidBusinessName(raw: string): boolean {
  const v = raw.trim();
  return v.length >= 3 && v.length <= 100 && hasLetter(v);
}

function isValidEmailStrict(raw: string): boolean {
  const v = raw.trim();
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(v);
}

type Step = 'account' | 'plan' | 'payment';

export function RegisterScreen({ navigation }: Props) {
  const { signUp } = useAuth();

  // Step tracking
  const [step, setStep] = useState<Step>('account');

  // Step 1 — account details
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Step 2 — plan
  const [selectedPlan, setSelectedPlan] = useState('free');

  // Step 3 — payment
  const [payerPhone, setPayerPhone] = useState('');
  const [payerPhoneError, setPayerPhoneError] = useState('');
  const [loading, setLoading] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'idle' | 'paying' | 'done'>('idle');
  const [paymentId, setPaymentId] = useState<string | null>(null);

  // ── Validation (step 1) ──────────────────────────────────
  const validateAccount = () => {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = 'Full name is required';
    else if (!isValidPersonName(fullName)) e.fullName = 'Enter a valid full name (3-80 chars, letters required)';
    if (!businessName.trim()) e.businessName = 'Business name is required';
    else if (!isValidBusinessName(businessName)) e.businessName = 'Enter a valid business name (3-100 chars, letters required)';
    if (!email.trim()) e.email = 'Email is required';
    else if (!isValidEmailStrict(email)) e.email = 'Invalid email address';
    if (!password) e.password = 'Password is required';
    else if (password.length < 6) e.password = 'Minimum 6 characters';
    if (password !== confirmPassword) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Step 1 → 2 ───────────────────────────────────────────
  const handleNextPlan = () => {
    if (!validateAccount()) return;
    setStep('plan');
  };

  // ── Step 2 → 3 or finish (free plan) ────────────────────
  const plan = PLANS.find(p => p.id === selectedPlan)!;
  const isPaid = plan.price > 0;

  const handleNextPayment = () => {
    if (isPaid) {
      setPayerPhone(phone); // pre-fill with registration phone if provided
      setStep('payment');
    } else {
      handleCreateAccount(null);
    }
  };

  // ── Create account + business + subscription ────────────
  const handleCreateAccount = async (snippePaymentId: string | null) => {
    setLoading(true);
    try {
      const cleanFullName = fullName.trim();
      const cleanBusinessName = businessName.trim();

      if (!isValidPersonName(cleanFullName)) {
        throw new Error('Enter a valid full name (3-80 chars, letters required).');
      }
      if (!isValidBusinessName(cleanBusinessName)) {
        throw new Error('Enter a valid business name (3-100 chars, letters required).');
      }

      // 1. Create auth user
      const { error: signUpError } = await signUp(
        email.trim().toLowerCase(),
        password,
        cleanFullName,
        { business_name: cleanBusinessName }
      );

      if (signUpError) {
        // signUp returns a message string — check if it's actually the
        // "check your email" message (not a true error)
        if (signUpError.includes('confirmation') || signUpError.includes('verify')) {
          Alert.alert(
            'Almost there!',
            'Check your email and click the confirmation link, then log in.',
          );
          setLoading(false);
          return;
        }
        Alert.alert('Registration Failed', signUpError);
        setLoading(false);
        return;
      }

      // 2. Get the newly created user id via session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Email confirmation required — user must verify before we can proceed
        Alert.alert(
          'Almost there!',
          'Check your email and click the confirmation link, then log in to complete setup.',
        );
        setLoading(false);
        return;
      }

      const userId = session.user.id;

      // 3. Create the business
      const { data: biz, error: bizErr } = await supabase
        .from('businesses')
        .insert({
          name: cleanBusinessName,
          owner_id: userId,
          phone: phone.trim() || null,
          is_verified: false,
        })
        .select()
        .single();

      if (bizErr) throw bizErr;

      // 4. Link user → business
      await supabase
        .from('users')
        .update({ business_id: biz.id })
        .eq('id', userId);

      // 5. Create subscription
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      const subPayload: Record<string, unknown> = {
        business_id: biz.id,
        plan: selectedPlan,
        status: isPaid ? 'pending' : 'active',
        billing_cycle: 'monthly',
        starts_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      };

      await supabase.from('subscriptions').insert(subPayload);

      // 6. If there was a payment, link payment → subscription
      if (snippePaymentId && isPaid) {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('business_id', biz.id)
          .maybeSingle();
        if (sub) {
          await supabase
            .from('payments')
            .update({ subscription_id: sub.id })
            .eq('id', snippePaymentId);
        }
      }

      setLoading(false);
      if (isPaid) {
        Alert.alert(
          'Payment Initiated',
          `A USSD push was sent to ${payerPhone}. Enter your PIN to activate your ${plan.name} plan, then log in.`,
          [{ text: 'OK', onPress: () => navigation.navigate('Login') }],
        );
      }
      // For free plan, AuthContext will pick up the session automatically.
    } catch (e: any) {
      setLoading(false);
      Alert.alert('Error', e?.message ?? 'Something went wrong. Please try again.');
    }
  };

  // ── Initiate mobile money payment to admin account ───────
  const handlePay = async () => {
    const normalized = normalizeTzPhone(payerPhone);
    if (!isValidTzPhone(normalized)) {
      setPayerPhoneError('Enter a valid mobile money number');
      return;
    }

    if (plan.price < MOBILE_MONEY_MIN_AMOUNT) {
      Alert.alert('Invalid amount', `Plan amount must be at least TZS ${MOBILE_MONEY_MIN_AMOUNT.toLocaleString()} for mobile money.`);
      return;
    }

    const cleanFullName = fullName.trim();
    const cleanBusinessName = businessName.trim();
    if (cleanFullName.length < 3 || cleanFullName.length > 80) {
      Alert.alert('Invalid name', 'Full name must be between 3 and 80 characters.');
      return;
    }
    if (!hasLetter(cleanFullName)) {
      Alert.alert('Invalid name', 'Full name must include letters.');
      return;
    }
    if (!isValidBusinessName(cleanBusinessName)) {
      Alert.alert('Invalid business name', 'Business name must be 3-100 characters and include letters.');
      return;
    }

    setPayerPhoneError('');
    setPaymentStep('paying');

    try {
      // First: create auth user so we have a real user/session for the payment
      setLoading(true);
      const { error: signUpError } = await signUp(
        email.trim().toLowerCase(),
        password,
        cleanFullName,
        { business_name: cleanBusinessName }
      );

      if (signUpError && !signUpError.includes('confirmation') && !signUpError.includes('verify')) {
        Alert.alert('Registration Failed', signUpError);
        setPaymentStep('idle');
        setLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        // Email confirmation needed — can't initiate payment without session
        Alert.alert(
          'Email verification required',
          'Please verify your email first, then log in and upgrade your plan from Settings.',
        );
        setPaymentStep('idle');
        setLoading(false);
        return;
      }

      // Create business first so we have a real business_id for the payment
      const { data: biz, error: bizErr } = await supabase
        .from('businesses')
        .insert({
          name: cleanBusinessName,
          owner_id: session.user.id,
          phone: phone.trim() || null,
          is_verified: false,
        })
        .select()
        .single();

      if (bizErr) throw bizErr;

      await supabase
        .from('users')
        .update({ business_id: biz.id })
        .eq('id', session.user.id);

      // Initiate payment via Edge Function — secrets stay server-side
      const { data: payResult, error: payErr } = await supabase.functions.invoke(
        'initiate-payment',
        {
          body: {
            payment_type: 'subscription',
            channel: 'mobile',
            amount: plan.price,
            business_id: biz.id,
            idempotency_key: generateIdempotencyKey('reg'),
            payer_phone: normalized,
            payer_name: cleanFullName,
            metadata: { plan: selectedPlan, email: email.trim().toLowerCase() },
          },
        },
      );

      if (payErr || !(payResult as any)?.success) {
        Alert.alert(
          'Payment Failed',
          (payResult as any)?.message ?? payErr?.message ?? 'Could not initiate payment.',
        );
        setPaymentStep('idle');
        setLoading(false);
        return;
      }

      const pid = (payResult as any).payment_id ?? null;
      setPaymentId(pid);

      // Create subscription (pending until payment confirmed by webhook)
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      const { data: sub } = await supabase
        .from('subscriptions')
        .insert({
          business_id: biz.id,
          plan: selectedPlan,
          status: 'pending',
          billing_cycle: 'monthly',
          starts_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .select('id')
        .single();

      // Link payment → subscription
      if (pid && sub) {
        await supabase
          .from('payments')
          .update({ subscription_id: sub.id })
          .eq('id', pid);
      }

      setPaymentStep('done');
      setLoading(false);
    } catch (e: any) {
      setLoading(false);
      setPaymentStep('idle');
      Alert.alert('Error', e?.message ?? 'Something went wrong.');
    }
  };

  // ── Render helpers ───────────────────────────────────────
  const STEPS: Step[] = ['account', 'plan', 'payment'];
  const stepIndex = STEPS.indexOf(step);
  const stepLabels = ['Account', 'Plan', 'Payment'];

  const renderHeader = () => (
    <View style={styles.header}>
      {step === 'account' && (
        <TouchableOpacity style={styles.headerBackBtn} onPress={() => navigation.navigate('Login')}>
          <Ionicons name="arrow-back" size={28} color={COLORS.white} />
        </TouchableOpacity>
      )}
      <View style={styles.logoIcon}>
        <Text style={styles.logoText}>SB</Text>
      </View>
      <Text style={styles.appName}>SmartBiz</Text>
    </View>
  );

  const renderProgress = () => (
    <View style={styles.progressRow}>
      {STEPS.map((s, i) => {
        const active = i <= stepIndex;
        const current = i === stepIndex;
        return (
          <View key={s} style={styles.progressItem}>
            <View style={[styles.progressDot, active && styles.progressDotActive, current && styles.progressDotCurrent]}>
              {active && !current
                ? <Ionicons name="checkmark" size={12} color={COLORS.white} />
                : <Text style={[styles.progressDotText, active && styles.progressDotTextActive]}>{i + 1}</Text>
              }
            </View>
            <Text style={[styles.progressLabel, current && styles.progressLabelActive]}>{stepLabels[i]}</Text>
            {i < STEPS.length - 1 && (
              <View style={[styles.progressLine, active && i < stepIndex && styles.progressLineActive]} />
            )}
          </View>
        );
      })}
    </View>
  );

  // ── Step 1: Account details ──────────────────────────────
  const renderAccount = () => (
    <View style={styles.card}>
      <Text style={styles.title}>Create account</Text>
      <Text style={styles.subtitle}>Set up your profile to get started</Text>

      <Input
        label="Full Name"
        placeholder="Your full name"
        value={fullName}
        onChangeText={setFullName}
        leftIcon="person-outline"
        error={errors.fullName}
      />
      <Input
        label="Business Name"
        placeholder="Your business name"
        value={businessName}
        onChangeText={setBusinessName}
        leftIcon="business-outline"
        error={errors.businessName}
      />
      <Input
        label="Email address"
        placeholder="business@email.com"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        leftIcon="mail-outline"
        error={errors.email}
      />
      <Input
        label="Phone Number (optional)"
        placeholder="0712 345 678"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        leftIcon="call-outline"
      />
      <Input
        label="Password"
        placeholder="Create a strong password"
        value={password}
        onChangeText={setPassword}
        isPassword
        leftIcon="lock-closed-outline"
        error={errors.password}
      />
      <Input
        label="Confirm Password"
        placeholder="Repeat your password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        isPassword
        leftIcon="lock-closed-outline"
        error={errors.confirmPassword}
      />

      <Button
        title="Choose a Plan →"
        onPress={handleNextPlan}
        fullWidth
        size="lg"
        style={styles.btn}
      />

      <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.loginLink}>
        <Text style={styles.loginText}>
          Already have an account? <Text style={styles.loginAction}>Sign in</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );

  // ── Step 2: Plan selection ───────────────────────────────
  const renderPlan = () => (
    <View style={styles.card}>
      <Text style={styles.title}>Choose your plan</Text>
      <Text style={styles.subtitle}>Select the plan that best fits your business</Text>

      {PLANS.map(p => (
        <TouchableOpacity
          key={p.id}
          style={[
            styles.planCard,
            selectedPlan === p.id && styles.planCardSelected,
            p.popular && styles.planCardPopular,
          ]}
          onPress={() => setSelectedPlan(p.id)}
          activeOpacity={0.8}
        >
          {p.popular && (
            <View style={styles.popularBadge}>
              <Text style={styles.popularText}>MOST POPULAR</Text>
            </View>
          )}
          <View style={styles.planRow}>
            <View style={[styles.planIcon, { backgroundColor: p.bg }]}>
              <Ionicons name={p.icon} size={20} color={p.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.planName, { color: p.color }]}>{p.name}</Text>
              <Text style={styles.planFeatures}>{p.features.slice(0, 3).join(' · ')}</Text>
            </View>
            <View style={styles.planPriceCol}>
              <Text style={styles.planPrice}>{p.priceLabel}</Text>
              <Text style={styles.planPeriod}>{p.period}</Text>
            </View>
            <View style={[styles.radioOuter, selectedPlan === p.id && styles.radioOuterActive]}>
              {selectedPlan === p.id && <View style={styles.radioInner} />}
            </View>
          </View>
        </TouchableOpacity>
      ))}

      {plan.price > 0 && (
        <View style={styles.paymentNote}>
          <Ionicons name="phone-portrait-outline" size={16} color={COLORS.info} />
          <Text style={styles.paymentNoteText}>
            Payment via mobile money (USSD push) to the SmartBiz platform account.
          </Text>
        </View>
      )}

      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setStep('account')}>
          <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        <Button
          title={isPaid ? `Pay ${plan.priceLabel} →` : 'Create Free Account →'}
          onPress={handleNextPayment}
          size="lg"
          style={{ flex: 1 }}
          loading={loading && !isPaid}
        />
      </View>
    </View>
  );

  // ── Step 3: Mobile money payment ────────────────────────
  const renderPayment = () => {
    if (paymentStep === 'done') {
      return (
        <View style={styles.card}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={64} color={COLORS.success} />
          </View>
          <Text style={[styles.title, { textAlign: 'center' }]}>Payment Initiated!</Text>
          <Text style={[styles.subtitle, { textAlign: 'center' }]}>
            A USSD push has been sent to {payerPhone}. Enter your PIN to complete the payment and activate your {plan.name} plan.
          </Text>
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.info} />
            <Text style={styles.infoText}>
              Once payment is confirmed, your subscription will be activated automatically.
            </Text>
          </View>
          <Button
            title="Go to Login"
            onPress={() => navigation.navigate('Login')}
            fullWidth
            size="lg"
            style={styles.btn}
          />
        </View>
      );
    }

    return (
      <View style={styles.card}>
        <Text style={styles.title}>Complete Payment</Text>
        <Text style={styles.subtitle}>
          Pay <Text style={{ fontWeight: '700', color: COLORS.text }}>{plan.priceLabel}</Text> to activate your {plan.name} plan
        </Text>

        {/* Payment summary */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Plan</Text>
            <Text style={styles.summaryValue}>{plan.name}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Amount</Text>
            <Text style={[styles.summaryValue, { color: COLORS.success, fontWeight: '700' }]}>
              {plan.priceLabel} {plan.period}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Method</Text>
            <View style={styles.methodChip}>
              <Ionicons name="phone-portrait-outline" size={12} color={COLORS.info} />
              <Text style={styles.methodChipText}>Mobile Money</Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        <Text style={styles.fieldLabel}>Your mobile money number</Text>
        <Text style={styles.fieldHint}>Enter the number that will receive the USSD push to confirm payment</Text>

        <Input
          label=""
          placeholder="e.g. 0712 345 678"
          value={payerPhone}
          onChangeText={v => { setPayerPhone(v); setPayerPhoneError(''); }}
          keyboardType="phone-pad"
          leftIcon="phone-portrait-outline"
          error={payerPhoneError}
        />

        <View style={styles.infoBox}>
          <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.success} />
          <Text style={styles.infoText}>
            You will receive a USSD prompt on your phone. Enter your mobile money PIN to authorize the payment of {plan.priceLabel}.
          </Text>
        </View>

        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep('plan')} disabled={paymentStep === 'paying'}>
            <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.payBtn, (paymentStep === 'paying' || loading) && { opacity: 0.7 }]}
            onPress={handlePay}
            disabled={paymentStep === 'paying' || loading}
          >
            {(paymentStep === 'paying' || loading)
              ? <ActivityIndicator color={COLORS.white} size="small" />
              : (
                <>
                  <Ionicons name="phone-portrait-outline" size={18} color={COLORS.white} />
                  <Text style={styles.payBtnText}>Send USSD Push</Text>
                </>
              )
            }
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <LinearGradient colors={[COLORS.primary, '#0F2318']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          {renderHeader()}
          {renderProgress()}
          {step === 'account' && renderAccount()}
          {step === 'plan' && renderPlan()}
          {step === 'payment' && renderPayment()}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.primary },
  content: { flexGrow: 1, padding: SPACING.xl, justifyContent: 'center', alignItems: 'center', paddingBottom: SPACING['4xl'] },
  inner: { width: '100%', maxWidth: 480 },

  // Header
  header: { alignItems: 'center', marginBottom: SPACING.lg, width: '100%', position: 'relative' },
  headerBackBtn: { position: 'absolute', left: 0, top: 0, padding: SPACING.xs },
  logoIcon: {
    width: 52,
    height: 52,
    borderRadius: 13,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  logoText: { color: COLORS.white, fontSize: FONTS.sizes.lg, fontWeight: 'bold' },
  appName: { color: COLORS.white, fontSize: FONTS.sizes['2xl'], fontWeight: '800' },

  // Progress indicator
  progressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    gap: 0,
  },
  progressItem: { alignItems: 'center', flex: 1, position: 'relative' },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  progressDotActive: { backgroundColor: COLORS.success },
  progressDotCurrent: { backgroundColor: COLORS.accent },
  progressDotText: { fontSize: FONTS.sizes.xs, color: 'rgba(255,255,255,0.6)', fontWeight: '700' },
  progressDotTextActive: { color: COLORS.white },
  progressLabel: { fontSize: FONTS.sizes.xs, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  progressLabelActive: { color: COLORS.white },
  progressLine: {
    position: 'absolute',
    top: 14,
    left: '50%',
    width: '100%',
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  progressLineActive: { backgroundColor: COLORS.success },

  // Card
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.xl, gap: SPACING.xs },
  title: { fontSize: FONTS.sizes['2xl'], fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  subtitle: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, marginBottom: SPACING.sm },

  btn: { marginTop: SPACING.sm },
  loginLink: { alignItems: 'center', marginTop: SPACING.sm },
  loginText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.base },
  loginAction: { color: COLORS.accent, fontWeight: '600' },

  // Plan cards
  planCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.sm,
    marginVertical: 4,
    backgroundColor: COLORS.background,
  },
  planCardSelected: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: COLORS.surfaceHover },
  planCardPopular: { borderColor: COLORS.success },
  popularBadge: {
    backgroundColor: COLORS.success,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    marginBottom: SPACING.xs,
  },
  popularText: { color: COLORS.white, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  planIcon: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planName: { fontSize: FONTS.sizes.base, fontWeight: '700' },
  planFeatures: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 1 },
  planPriceCol: { alignItems: 'flex-end', marginRight: SPACING.xs },
  planPrice: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text },
  planPeriod: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: { borderColor: COLORS.primary },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },

  paymentNote: {
    flexDirection: 'row',
    gap: SPACING.xs,
    alignItems: 'flex-start',
    backgroundColor: COLORS.infoLight,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginTop: SPACING.xs,
  },
  paymentNoteText: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.info },

  btnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm, alignItems: 'center' },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
  },
  backBtnText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontWeight: '600' },

  // Payment step
  summaryBox: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  summaryValue: { fontSize: FONTS.sizes.sm, color: COLORS.text },
  methodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.infoLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  methodChipText: { fontSize: FONTS.sizes.xs, color: COLORS.info, fontWeight: '600' },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.xs },
  fieldLabel: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text },
  fieldHint: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginBottom: SPACING.xs },
  infoBox: {
    flexDirection: 'row',
    gap: SPACING.xs,
    alignItems: 'flex-start',
    backgroundColor: COLORS.successLight,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
  },
  infoText: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.success },
  payBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.base,
  },
  payBtnText: { color: COLORS.white, fontSize: FONTS.sizes.base, fontWeight: '700' },

  // Success
  successIcon: { alignItems: 'center', marginBottom: SPACING.sm },
});
