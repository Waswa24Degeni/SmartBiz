import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
  useWindowDimensions, Alert, Modal, FlatList, Platform, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS, BREAKPOINTS } from '../../lib/constants';
import { Toggle } from '../../components/common/Toggle';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { SNIPPE_BANKS, generateIdempotencyKey } from '../../lib/snippe';
import { LANGUAGES, CURRENCIES, AppLanguage, AppCurrency } from '../../context/SettingsContext';

const SETTINGS_MENU = [
  { id: 'Profile',          label: 'Profile',           icon: 'person-outline' },
  { id: 'Notifications',    label: 'Notifications',     icon: 'notifications-outline' },
  { id: 'CheckoutSettings', label: 'Checkout settings', icon: 'settings-outline' },
  { id: 'Subscription',     label: 'Subscription',      icon: 'ribbon-outline' },
  { id: 'LanguageRegion',   label: 'Language & Region', icon: 'globe-outline' },
  { id: 'Security',         label: 'Security',          icon: 'shield-outline' },
];

type SettingSection = 'Profile' | 'Notifications' | 'CheckoutSettings' | 'Subscription' | 'Security' | 'LanguageRegion';

export function SettingsScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;
  const [activeSection, setActiveSection] = useState<SettingSection>('Profile');

  return (
    <View style={styles.container}>
      <View style={[styles.layout, isMobile && styles.layoutMobile]}>
        {/* Settings sidebar / top tabs */}
        {isMobile ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mobileTabBar}>
            {SETTINGS_MENU.map(item => (
              <TouchableOpacity
                key={item.id}
                style={[styles.mobileTab, activeSection === item.id && styles.mobileTabActive]}
                onPress={() => setActiveSection(item.id as SettingSection)}
              >
                <Ionicons
                  name={item.icon as any}
                  size={16}
                  color={activeSection === item.id ? COLORS.accent : COLORS.textSecondary}
                />
                <Text style={[styles.mobileTabText, activeSection === item.id && styles.mobileTabTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.menu}>
            {SETTINGS_MENU.map(item => (
              <TouchableOpacity
                key={item.id}
                style={[styles.menuItem, activeSection === item.id && styles.menuItemActive]}
                onPress={() => setActiveSection(item.id as SettingSection)}
              >
                <Ionicons
                  name={item.icon as any}
                  size={18}
                  color={activeSection === item.id ? COLORS.accent : COLORS.textSecondary}
                />
                <Text style={[styles.menuLabel, activeSection === item.id && styles.menuLabelActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Content area */}
        <ScrollView style={styles.content}>
          {activeSection === 'Profile'          && <ProfileSection />}
          {activeSection === 'Notifications'    && <NotificationsSection />}
          {activeSection === 'CheckoutSettings' && <CheckoutSettingsSection />}
          {activeSection === 'Subscription'     && <SubscriptionSection />}
          {activeSection === 'Security'         && <SecuritySection />}
          {activeSection === 'LanguageRegion'   && <LanguageRegionSection />}
        </ScrollView>
      </View>
    </View>
  );
}

// ============================================================
// Profile Section — reads/writes users + businesses
// ============================================================
function ProfileSection() {
  const { user, business, refreshUser } = useAuth();
  const [fullName, setFullName]   = useState(user?.full_name ?? '');
  const [phone, setPhone]         = useState(user?.phone ?? '');
  const [bizName, setBizName]     = useState(business?.name ?? '');
  const [bizCategory, setBizCat]  = useState(business?.category ?? '');
  const [currency, setCurrency]   = useState(business?.currency ?? 'TZS');
  const [saving, setSaving]       = useState(false);
  const [logoUri, setLogoUri]     = useState<string | null>(business?.logo_url ?? null);
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    setFullName(user?.full_name ?? '');
    setPhone(user?.phone ?? '');
    setBizName(business?.name ?? '');
    setBizCat(business?.category ?? '');
    setCurrency(business?.currency ?? 'TZS');
    setLogoUri(business?.logo_url ?? null);
  }, [user, business]);

  // ── Logo upload ─────────────────────────────────────────────────────────
  const handlePickLogo = async () => {
    if (!business?.id) {
      Alert.alert('No business', 'Create a business first.');
      return;
    }

    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'Allow photo library access to upload a logo.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => ImagePicker.requestMediaLibraryPermissionsAsync() },
        ]
      );
      return;
    }

    Alert.alert('Upload Logo', 'Choose source', [
      {
        text: 'Camera',
        onPress: async () => {
          const camStatus = await ImagePicker.requestCameraPermissionsAsync();
          if (camStatus.status !== 'granted') {
            Alert.alert('Permission denied', 'Camera access is required.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            await uploadLogo(result.assets[0]);
          }
        },
      },
      {
        text: 'Photo Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            await uploadLogo(result.assets[0]);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadLogo = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!business?.id) return;
    setLogoUploading(true);
    try {
      const mimeType = asset.mimeType ?? 'image/jpeg';
      const fallbackExt = mimeType.includes('png') ? 'png' : 'jpg';
      const fileNameFromAsset = asset.fileName ?? '';
      const extFromName = fileNameFromAsset.includes('.')
        ? fileNameFromAsset.split('.').pop()?.toLowerCase()
        : undefined;
      const ext = extFromName || fallbackExt;
      const fileName = `logo-${business.id}-${Date.now()}.${ext}`;
      const filePath = `business-logos/${fileName}`;

      let fileBody: Blob | File;

      // Web: use the native File object directly from image picker to avoid fetch(uri) failures.
      if (Platform.OS === 'web') {
        const maybeFile = (asset as any).file as File | undefined;
        if (maybeFile) {
          fileBody = maybeFile;
        } else {
          const response = await fetch(asset.uri);
          fileBody = await response.blob();
        }
      } else {
        const response = await fetch(asset.uri);
        fileBody = await response.blob();
      }

      // Try preferred bucket first, then fallback bucket name used in some deployments.
      const candidateBuckets = ['business-assets', 'business-logos'];
      let uploadedBucket: string | null = null;
      let lastUploadError: any = null;

      for (const bucket of candidateBuckets) {
        const { error: uploadErr } = await supabase.storage
          .from(bucket)
          // Do not use upsert here; RLS often blocks upsert unless UPDATE/SELECT are also granted.
          .upload(filePath, fileBody, { contentType: mimeType, upsert: false });

        if (!uploadErr) {
          uploadedBucket = bucket;
          lastUploadError = null;
          break;
        }

        lastUploadError = uploadErr;
      }

      if (!uploadedBucket) {
        throw lastUploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(uploadedBucket)
        .getPublicUrl(filePath);

      // Save to businesses table
      const { error: dbErr } = await supabase
        .from('businesses')
        .update({ logo_url: publicUrl })
        .eq('id', business.id);

      if (dbErr) throw dbErr;

      setLogoUri(publicUrl);
      await refreshUser();
      Alert.alert('Logo updated', 'Your business logo has been saved.');
    } catch (e: any) {
      const msg = String(e?.message ?? 'Could not upload logo. Please try again.');
      if (/bucket|not found/i.test(msg)) {
        Alert.alert(
          'Upload failed',
          'Storage bucket missing. Create a public bucket named business-assets (or business-logos) in Supabase Storage, then try again.'
        );
      } else if (/row-level security|policy|permission|unauthorized|403/i.test(msg)) {
        Alert.alert(
          'Upload failed',
          'Storage policy blocked upload. Add Storage policies for authenticated users to INSERT (and optionally SELECT/UPDATE) in your logo bucket.'
        );
      } else {
        Alert.alert('Upload failed', msg);
      }
    } finally {
      setLogoUploading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    const [userRes, bizRes] = await Promise.all([
      supabase.from('users').update({ full_name: fullName.trim(), phone: phone.trim() }).eq('id', user.id),
      business?.id
        ? supabase.from('businesses').update({ name: bizName.trim(), category: bizCategory.trim(), currency: currency.trim() }).eq('id', business.id)
        : Promise.resolve({ error: null }),
    ]);
    setSaving(false);
    if (userRes.error || (bizRes as any).error) {
      Alert.alert('Error', userRes.error?.message ?? (bizRes as any).error?.message);
    } else {
      await refreshUser();
      Alert.alert('Saved', 'Profile updated successfully');
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Profile</Text>

      <View style={styles.profileCard}>
        {/* Logo / Avatar with camera tap */}
        <TouchableOpacity
          style={styles.avatarWrap}
          onPress={handlePickLogo}
          activeOpacity={0.8}
          disabled={logoUploading}
        >
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(business?.name ?? user?.full_name ?? 'B').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.avatarBadge}>
            {logoUploading
              ? <ActivityIndicator size={10} color={COLORS.white} />
              : <Ionicons name="camera" size={12} color={COLORS.white} />}
          </View>
        </TouchableOpacity>

        <Text style={styles.profileName}>{user?.full_name ?? '-'}</Text>
        <Text style={styles.profileStatus}>{user?.email}</Text>
        {business && (
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{business.name}</Text>
              <Text style={styles.statLabel}>Business</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{business.currency}</Text>
              <Text style={styles.statLabel}>Currency</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Personal Information</Text>
        {[
          { label: 'Full Name',  value: fullName,   setter: setFullName },
          { label: 'Phone',      value: phone,      setter: setPhone },
        ].map(f => (
          <View key={f.label} style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>{f.label}</Text>
            <TextInput
              style={styles.editableInput}
              value={f.value}
              onChangeText={f.setter}
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
        ))}

        {business && (
          <>
            <Text style={[styles.formTitle, { marginTop: SPACING.lg }]}>Business Information</Text>
            {[
              { label: 'Business Name', value: bizName,    setter: setBizName },
              { label: 'Category',      value: bizCategory, setter: setBizCat },
              { label: 'Currency',      value: currency,   setter: setCurrency },
            ].map(f => (
              <View key={f.label} style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={styles.editableInput}
                  value={f.value}
                  onChangeText={f.setter}
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            ))}
          </>
        )}

        <Button
          title={saving ? 'Saving...' : 'Save Changes'}
          onPress={handleSave}
          fullWidth size="lg"
          style={{ marginTop: SPACING.base }}
        />
      </View>
    </View>
  );
}

// ============================================================
// Notifications Section — reads/writes settings table
// ============================================================
function NotificationsSection() {
  const { business } = useAuth();
  const [loading, setLoading] = useState(true);
  const [notifs, setNotifs] = useState({
    notify_new_messages_push:  true,
    notify_new_messages_email: false,
    notify_weekly_report:      true,
    notify_billing_alert:      true,
  });

  const loadSettings = useCallback(async () => {
    if (!business?.id) { setLoading(false); return; }
    const { data } = await supabase
      .from('settings')
      .select('notify_new_messages_push, notify_new_messages_email, notify_weekly_report, notify_billing_alert')
      .eq('business_id', business.id)
      .maybeSingle();
    if (data) setNotifs({
      notify_new_messages_push:  !!data.notify_new_messages_push,
      notify_new_messages_email: !!data.notify_new_messages_email,
      notify_weekly_report:      !!data.notify_weekly_report,
      notify_billing_alert:      !!data.notify_billing_alert,
    });
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // Real-time: reflect changes from another device or admin immediately
  useEffect(() => {
    if (!business?.id) return;
    const ch = supabase
      .channel(`notif-settings:${business.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'settings',
        filter: `business_id=eq.${business.id}`,
      }, (payload) => {
        const d = (payload as any).new;
        if (!d) return;
        setNotifs({
          notify_new_messages_push:  !!d.notify_new_messages_push,
          notify_new_messages_email: !!d.notify_new_messages_email,
          notify_weekly_report:      !!d.notify_weekly_report,
          notify_billing_alert:      !!d.notify_billing_alert,
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [business?.id]);

  // Auto-save each toggle immediately — no manual Save button needed
  const toggle = async (key: keyof typeof notifs) => {
    if (!business?.id) return;
    const prev = notifs;
    const updated = { ...notifs, [key]: !notifs[key] };
    setNotifs(updated); // optimistic
    const { error } = await supabase
      .from('settings')
      .upsert({ business_id: business.id, ...updated }, { onConflict: 'business_id' });
    if (error) {
      setNotifs(prev); // revert on failure
      Alert.alert('Error saving setting', error.message);
    }
  };

  if (loading) return <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />;

  const ROWS = [
    { label: 'New messages',  pushKey: 'notify_new_messages_push' as const, emailKey: 'notify_new_messages_email' as const },
    { label: 'Weekly report', pushKey: 'notify_weekly_report'      as const, emailKey: 'notify_billing_alert'      as const },
  ];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Notifications</Text>
      <Text style={styles.sectionSubtitle}>Changes are saved automatically</Text>
      <View style={styles.formCard}>
        <View style={styles.notifHeader}>
          <Text style={[styles.notifHeadText, { flex: 1 }]}>Type</Text>
          <Text style={styles.notifHeadText}>Push</Text>
          <View style={{ width: 24 }} />
          <Text style={styles.notifHeadText}>Email</Text>
        </View>
        {ROWS.map(row => (
          <View key={row.label} style={styles.notifRow}>
            <Text style={styles.notifLabel}>{row.label}</Text>
            <Toggle value={notifs[row.pushKey]}  onChange={() => toggle(row.pushKey)}  />
            <View style={{ width: 24 }} />
            <Toggle value={notifs[row.emailKey]} onChange={() => toggle(row.emailKey)} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ============================================================
// Checkout Settings Section — Mobile Money + Cash toggles
// ============================================================
function CheckoutSettingsSection() {
  const { business } = useAuth();
  const [loading, setLoading] = useState(true);
  const [checkout, setCheckout] = useState({
    save_payment_history: true,
    // payment_bank_card column is repurposed as the "Mobile Money" toggle
    payment_bank_card:    true,
    payment_cash:         true,
  });

  const loadSettings = useCallback(async () => {
    if (!business?.id) { setLoading(false); return; }
    const { data } = await supabase
      .from('settings')
      .select('save_payment_history, payment_bank_card, payment_cash')
      .eq('business_id', business.id)
      .maybeSingle();
    if (data) setCheckout({
      save_payment_history: !!data.save_payment_history,
      payment_bank_card:    !!data.payment_bank_card,
      payment_cash:         !!data.payment_cash,
    });
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  useEffect(() => {
    if (!business?.id) return;
    const ch = supabase
      .channel(`checkout-settings:${business.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'settings',
        filter: `business_id=eq.${business.id}`,
      }, (payload) => {
        const d = (payload as any).new;
        if (!d) return;
        setCheckout({
          save_payment_history: !!d.save_payment_history,
          payment_bank_card:    !!d.payment_bank_card,
          payment_cash:         !!d.payment_cash,
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [business?.id]);

  // Auto-save each toggle immediately
  const toggle = async (key: keyof typeof checkout) => {
    if (!business?.id) return;
    const prev = checkout;
    const updated = { ...checkout, [key]: !checkout[key] };
    setCheckout(updated);
    const { error } = await supabase
      .from('settings')
      .upsert({ business_id: business.id, ...updated }, { onConflict: 'business_id' });
    if (error) {
      setCheckout(prev);
      Alert.alert('Error saving setting', error.message);
    }
  };

  if (loading) return <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Checkout settings</Text>
      <Text style={styles.sectionSubtitle}>Changes are saved automatically</Text>
      <View style={styles.formCard}>
        <Text style={styles.subsectionTitle}>Payment history</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Save payment history</Text>
          <Toggle value={checkout.save_payment_history} onChange={() => toggle('save_payment_history')} />
        </View>
        <View style={styles.dividerLine} />
        <Text style={styles.subsectionTitle}>Accepted payment methods</Text>
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>Mobile Money</Text>
            <Text style={styles.alertSub}>M-Pesa, Airtel Money, Tigo Pesa, Halopesa</Text>
          </View>
          <Toggle value={checkout.payment_bank_card} onChange={() => toggle('payment_bank_card')} />
        </View>
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>Cash</Text>
            <Text style={styles.alertSub}>Physical cash at point of sale</Text>
          </View>
          <Toggle value={checkout.payment_cash} onChange={() => toggle('payment_cash')} />
        </View>
      </View>
    </View>
  );
}

// ============================================================
// Payment Section — full CRUD on business_payment_config
// ============================================================
function PaymentSection() {
  const { business } = useAuth();
  const [loading, setLoading]               = useState(true);
  const [saving, setSaving]                 = useState(false);
  const [deleting, setDeleting]             = useState(false);
  const [hasRecord, setHasRecord]           = useState(false);
  const [payoutMethod, setPayoutMethod]     = useState<'mobile' | 'bank'>('mobile');
  const [receivePhone, setReceivePhone]     = useState('');
  const [receiveName, setReceiveName]       = useState('');
  const [receiveEmail, setReceiveEmail]     = useState('');
  const [bankCode, setBankCode]             = useState('');
  const [bankAccount, setBankAccount]       = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [bankSearch, setBankSearch]         = useState('');

  const loadConfig = useCallback(async () => {
    if (!business?.id) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('business_payment_config')
      .select('payout_method, receive_phone, receive_name, receive_email, bank_code, bank_account, bank_account_name')
      .eq('business_id', business.id)
      .maybeSingle();
    if (error) { console.error('payment config load:', error.message); }
    if (data) {
      setHasRecord(true);
      setPayoutMethod((data as any).payout_method ?? 'mobile');
      setReceivePhone((data as any).receive_phone ?? '');
      setReceiveName((data as any).receive_name ?? '');
      setReceiveEmail((data as any).receive_email ?? '');
      setBankCode((data as any).bank_code ?? '');
      setBankAccount((data as any).bank_account ?? '');
      setBankAccountName((data as any).bank_account_name ?? '');
    }
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  useEffect(() => {
    if (!business?.id) return;
    const ch = supabase
      .channel(`payment-config:${business.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'business_payment_config',
        filter: `business_id=eq.${business.id}`,
      }, (payload) => {
        const d = (payload as any).new;
        if (!d) return;
        setHasRecord(true);
        setPayoutMethod(d.payout_method ?? 'mobile');
        setReceivePhone(d.receive_phone ?? '');
        setReceiveName(d.receive_name ?? '');
        setReceiveEmail(d.receive_email ?? '');
        setBankCode(d.bank_code ?? '');
        setBankAccount(d.bank_account ?? '');
        setBankAccountName(d.bank_account_name ?? '');
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [business?.id]);

  const selectedBank = SNIPPE_BANKS.find(b => b.code === bankCode);
  const filteredBanks = bankSearch
    ? SNIPPE_BANKS.filter(b =>
        b.name.toLowerCase().includes(bankSearch.toLowerCase()) ||
        b.code.toLowerCase().includes(bankSearch.toLowerCase())
      )
    : SNIPPE_BANKS;

  // CREATE or UPDATE
  const handleSave = async () => {
    if (!business?.id) {
      Alert.alert('Error', 'No business found. Please sign out and back in.');
      return;
    }
    if (payoutMethod === 'mobile' && !receivePhone.trim()) {
      Alert.alert('Required', 'Please enter a mobile money phone number.');
      return;
    }
    if (payoutMethod === 'bank') {
      if (!bankCode)               { Alert.alert('Required', 'Please select a bank.'); return; }
      if (!bankAccount.trim())     { Alert.alert('Required', 'Please enter your bank account number.'); return; }
      if (!bankAccountName.trim()) { Alert.alert('Required', 'Please enter the account holder name.'); return; }
    }
    setSaving(true);
    try {
      const payload = {
        business_id:       business.id,
        payout_method:     payoutMethod,
        receive_phone:     receivePhone.trim()    || null,
        receive_name:      receiveName.trim()     || null,
        receive_email:     receiveEmail.trim()    || null,
        bank_code:         bankCode               || null,
        bank_account:      bankAccount.trim()     || null,
        bank_account_name: bankAccountName.trim() || null,
      };

      // Check if a row already exists for this business
      const { data: existing, error: selectErr } = await supabase
        .from('business_payment_config')
        .select('id')
        .eq('business_id', business.id)
        .maybeSingle();

      if (selectErr) {
        if (selectErr.code === '42P01') {
          throw new Error(
            'The payment settings table is missing from your database.\n\n' +
            'Fix: Open Supabase Dashboard → SQL Editor → paste and run:\n' +
            'scripts/fix-payment-config.sql'
          );
        }
        throw new Error(`Database error (${selectErr.code}): ${selectErr.message}`);
      }

      if (existing?.id) {
        // Row exists — UPDATE
        const { error: updateErr } = await supabase
          .from('business_payment_config')
          .update(payload)
          .eq('business_id', business.id);
        if (updateErr) throw new Error(`Update failed (${updateErr.code}): ${updateErr.message}`);
        setHasRecord(true);
        Alert.alert('Saved', 'Payment settings updated.');
      } else {
        // No row yet — INSERT
        const { error: insertErr } = await supabase
          .from('business_payment_config')
          .insert(payload);
        if (insertErr) throw new Error(`Insert failed (${insertErr.code}): ${insertErr.message}`);
        setHasRecord(true);
        Alert.alert('Saved', 'Payment settings saved.');
      }
    } catch (e: any) {
      console.error('[PaymentSection] handleSave error:', e);
      Alert.alert('Save failed', String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  // DELETE — clears the payment config record
  const handleDelete = () => {
    Alert.alert(
      'Clear payment settings',
      'This will remove all saved payment account details. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            if (!business?.id) return;
            setDeleting(true);
            try {
              const { error } = await supabase
                .from('business_payment_config')
                .delete()
                .eq('business_id', business.id);
              if (error) throw new Error(error.message);
              setHasRecord(false);
              setPayoutMethod('mobile');
              setReceivePhone(''); setReceiveName(''); setReceiveEmail('');
              setBankCode(''); setBankAccount(''); setBankAccountName('');
              Alert.alert('Cleared', 'Payment settings removed.');
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Could not clear payment settings.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  if (loading) return <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Payment Account</Text>
      <Text style={styles.sectionSubtitle}>Configure where customer payments are deposited</Text>

      <View style={styles.formCard}>
        {/* Status badge */}
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: hasRecord ? COLORS.success : COLORS.warning }]} />
          <Text style={styles.statusText}>
            {hasRecord ? 'Payment account configured' : 'No payment account set up yet'}
          </Text>
        </View>
        <View style={styles.dividerLine} />

        {/* Receive method selector */}
        <Text style={styles.subsectionTitle}>Receive Method</Text>
        <View style={styles.payMethodRow}>
          {([
            { method: 'mobile' as const, label: 'Mobile Money', icon: 'phone-portrait-outline' },
            { method: 'bank'   as const, label: 'Bank Transfer', icon: 'business-outline' },
          ]).map(opt => (
            <TouchableOpacity
              key={opt.method}
              style={[styles.payMethodCard, payoutMethod === opt.method && styles.payMethodCardActive]}
              onPress={() => setPayoutMethod(opt.method)}
            >
              <Ionicons
                name={opt.icon as any}
                size={20}
                color={payoutMethod === opt.method ? COLORS.accent : COLORS.textMuted}
              />
              <Text style={[styles.payMethodLabel, payoutMethod === opt.method && styles.payMethodLabelActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.dividerLine} />

        {payoutMethod === 'mobile' ? (
          <>
            <Text style={styles.subsectionTitle}>Mobile Money Account</Text>
            {([
              { label: 'Phone Number (e.g. 0712345678)', value: receivePhone, setter: setReceivePhone, keyboard: 'phone-pad' as const },
              { label: 'Account Name',                   value: receiveName,  setter: setReceiveName,  keyboard: 'default' as const },
              { label: 'Email (optional)',                value: receiveEmail, setter: setReceiveEmail, keyboard: 'email-address' as const },
            ]).map(f => (
              <View key={f.label} style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={styles.editableInput}
                  value={f.value}
                  onChangeText={f.setter}
                  keyboardType={f.keyboard}
                  autoCapitalize="none"
                  placeholderTextColor={COLORS.textMuted}
                  placeholder={f.label}
                />
              </View>
            ))}
          </>
        ) : (
          <>
            <Text style={styles.subsectionTitle}>Bank Account</Text>
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Bank</Text>
              <TouchableOpacity
                style={[styles.editableInput, styles.bankPickerBtn]}
                onPress={() => { setBankSearch(''); setShowBankPicker(true); }}
              >
                <Text style={selectedBank ? styles.bankPickerSelected : styles.bankPickerPlaceholder}>
                  {selectedBank ? `${selectedBank.code} — ${selectedBank.name}` : 'Select a bank…'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            {([
              { label: 'Account Number', value: bankAccount,     setter: setBankAccount,     keyboard: 'numeric' as const },
              { label: 'Account Name',   value: bankAccountName, setter: setBankAccountName, keyboard: 'default' as const },
            ]).map(f => (
              <View key={f.label} style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={styles.editableInput}
                  value={f.value}
                  onChangeText={f.setter}
                  keyboardType={f.keyboard}
                  autoCapitalize="words"
                  placeholderTextColor={COLORS.textMuted}
                  placeholder={f.label}
                />
              </View>
            ))}
          </>
        )}

        <Button
          title={saving ? 'Saving…' : hasRecord ? 'Update Payment Settings' : 'Save Payment Settings'}
          onPress={handleSave}
          loading={saving}
          fullWidth size="lg"
          style={{ marginTop: SPACING.xl }}
        />

        {hasRecord && (
          <Button
            title={deleting ? 'Clearing…' : 'Clear Payment Settings'}
            variant="danger"
            onPress={handleDelete}
            loading={deleting}
            fullWidth size="lg"
            style={{ marginTop: SPACING.sm }}
          />
        )}
      </View>

      {/* Bank picker modal */}
      <Modal
        visible={showBankPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBankPicker(false)}
      >
        <TouchableOpacity
          style={styles.bankModalOverlay}
          activeOpacity={1}
          onPress={() => setShowBankPicker(false)}
        />
        <View style={styles.bankModalContainer}>
          <View style={styles.bankModalHeader}>
            <Text style={styles.bankModalTitle}>Select Bank</Text>
            <TouchableOpacity onPress={() => setShowBankPicker(false)}>
              <Ionicons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.bankModalSearch}
            placeholder="Search bank…"
            placeholderTextColor={COLORS.textMuted}
            value={bankSearch}
            onChangeText={setBankSearch}
            autoFocus
          />
          <FlatList
            data={filteredBanks}
            keyExtractor={item => item.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.bankModalItem, bankCode === item.code && styles.bankModalItemActive]}
                onPress={() => { setBankCode(item.code); setShowBankPicker(false); }}
              >
                <Text style={[styles.bankModalCode, bankCode === item.code && { color: COLORS.accent }]}>
                  {item.code}
                </Text>
                <Text style={styles.bankModalName} numberOfLines={1}>{item.name}</Text>
                {bankCode === item.code && (
                  <Ionicons name="checkmark" size={18} color={COLORS.accent} />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

// ============================================================
// Security Section — change password + live session card
// ============================================================
function SecuritySection() {
  const { user, signOut } = useAuth();
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging]   = useState(false);
  const [showNew, setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Derive device info from React Native's Platform API
  const deviceOS   = Platform.OS === 'ios' ? 'iOS'
                   : Platform.OS === 'android' ? 'Android'
                   : 'Web Browser';
  const deviceVer  = Platform.OS !== 'web'
                   ? ` ${Platform.Version}`
                   : '';
  const deviceName = `${deviceOS}${deviceVer}`;

  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      Alert.alert('Required', 'Please enter a new password.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Too short', 'Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }
    setChanging(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChanging(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Success', 'Password updated successfully.');
    }
  };

  const handleSignOutAll = () => {
    Alert.alert(
      'Sign Out All Devices',
      'You will be signed out on all devices, including this one.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out All',
          style: 'destructive',
          onPress: async () => {
            await supabase.auth.signOut({ scope: 'global' });
            await signOut();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Security</Text>

      {/* Change password card */}
      <View style={styles.formCard}>
        <Text style={styles.subsectionTitle}>Change Password</Text>
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>New Password</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
            <TextInput
              style={[styles.editableInput, { flex: 1 }]}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showNew}
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor={COLORS.textMuted}
              placeholder="Min. 8 characters"
            />
            <TouchableOpacity onPress={() => setShowNew(p => !p)} style={{ padding: SPACING.xs }}>
              <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Confirm New Password</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
            <TextInput
              style={[styles.editableInput, { flex: 1 }]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor={COLORS.textMuted}
              placeholder="Re-enter new password"
            />
            <TouchableOpacity onPress={() => setShowConfirm(p => !p)} style={{ padding: SPACING.xs }}>
              <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
        <Button
          title={changing ? 'Updating...' : 'Update Password'}
          onPress={handleChangePassword}
          loading={changing}
          fullWidth size="lg"
          style={{ marginTop: SPACING.sm }}
        />
      </View>

      {/* Active sessions card — shows real device OS + name */}
      <View style={[styles.formCard, { marginTop: SPACING.md }]}>
        <Text style={styles.subsectionTitle}>Active Sessions</Text>
        <View style={styles.sessionCard}>
          <View style={styles.sessionIconWrap}>
            <Ionicons
              name={
                Platform.OS === 'ios'     ? 'phone-portrait-outline' :
                Platform.OS === 'android' ? 'phone-portrait-outline' :
                'desktop-outline'
              }
              size={24}
              color={COLORS.accent}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sessionDevice}>{deviceName}</Text>
            <Text style={styles.sessionEmail}>{user?.email}</Text>
            <View style={styles.sessionBadge}>
              <View style={[styles.statusDot, { backgroundColor: COLORS.success, marginRight: SPACING.xs }]} />
              <Text style={styles.sessionBadgeText}>Active now · This device</Text>
            </View>
          </View>
        </View>
        <Button
          title="Sign Out All Devices"
          variant="danger"
          onPress={handleSignOutAll}
          fullWidth size="lg"
          style={{ marginTop: SPACING.md }}
        />
      </View>
    </View>
  );
}

// ============================================================
// Language & Region — English/Kiswahili, TZS/UGX/KES pills
// Changes save to both settings AND businesses.currency
// ============================================================
function LanguageRegionSection() {
  const { business, refreshUser } = useAuth();
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [language, setLanguage] = useState<AppLanguage>('English');
  const [currency, setCurrency] = useState<AppCurrency>('TZS');

  const loadSettings = useCallback(async () => {
    if (!business?.id) { setLoading(false); return; }
    const { data } = await supabase
      .from('settings')
      .select('language, currency')
      .eq('business_id', business.id)
      .maybeSingle();
    if (data) {
      setLanguage((data as any).language ?? 'English');
      setCurrency((data as any).currency ?? 'TZS');
    } else {
      // No settings row yet — fall back to what's on the business record
      setCurrency((business.currency as AppCurrency) ?? 'TZS');
    }
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  useEffect(() => {
    if (!business?.id) return;
    const ch = supabase
      .channel(`lang-region:${business.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'settings',
        filter: `business_id=eq.${business.id}`,
      }, (payload) => {
        const d = (payload as any).new;
        if (!d) return;
        setLanguage(d.language ?? 'English');
        setCurrency(d.currency ?? 'TZS');
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [business?.id]);

  const handleSave = async () => {
    if (!business?.id) return;
    setSaving(true);

    // Upsert settings row (language + currency)
    const settingsResult = await supabase
      .from('settings')
      .upsert({ business_id: business.id, language, currency }, { onConflict: 'business_id' });

    // Also mirror currency on the businesses record so it propagates system-wide
    const bizResult = await supabase
      .from('businesses')
      .update({ currency })
      .eq('id', business.id);

    setSaving(false);

    if (settingsResult.error || bizResult.error) {
      Alert.alert('Error', settingsResult.error?.message ?? bizResult.error?.message);
      return;
    }

    // Refresh AuthContext so business.currency is up to date everywhere
    await refreshUser();
    Alert.alert('Saved', 'Language & Region settings applied to the entire system.');
  };

  if (loading) return <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Language & Region</Text>
      <Text style={styles.sectionSubtitle}>These settings apply across the entire app</Text>

      <View style={styles.formCard}>
        <Text style={styles.subsectionTitle}>Language</Text>
        <View style={styles.langRow}>
          {LANGUAGES.map(lang => (
            <TouchableOpacity
              key={lang}
              style={[styles.langPill, language === lang && styles.langPillActive]}
              onPress={() => setLanguage(lang)}
            >
              <Text style={[styles.langPillText, language === lang && styles.langPillTextActive]}>
                {lang}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.dividerLine} />
        <Text style={styles.subsectionTitle}>Currency</Text>
        <View style={styles.langRow}>
          {CURRENCIES.map(c => (
            <TouchableOpacity
              key={c.code}
              style={[styles.langPill, currency === c.code && styles.langPillActive]}
              onPress={() => setCurrency(c.code)}
            >
              <Text style={[styles.langPillText, currency === c.code && styles.langPillTextActive]}>
                {c.code}
              </Text>
              <Text style={[styles.currencyName, currency === c.code && { color: COLORS.accent }]}>
                {c.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Button
          title={saving ? 'Saving...' : 'Save & Apply'}
          onPress={handleSave}
          loading={saving}
          fullWidth size="lg"
          style={{ marginTop: SPACING.lg }}
        />
      </View>
    </View>
  );
}

// ============================================================
// Subscription Section — view plan, pay to upgrade/renew
// ============================================================

const SUB_PLANS = [
  { id: 'starter',  name: 'Starter',  price: 15000,  features: ['3 users', '500 products', 'Advanced reports'] },
  { id: 'business', name: 'Business', price: 35000,  features: ['10 users', 'Unlimited products', 'Priority support'] },
  { id: 'premium',  name: 'Premium',  price: 80000,  features: ['Unlimited users', 'All features', 'Dedicated support'] },
] as const;

type SubPlanId = typeof SUB_PLANS[number]['id'];

function SubscriptionSection() {
  const { user, business } = useAuth();
  const [loading, setLoading]           = useState(true);
  const [currentSub, setCurrentSub]     = useState<{ plan: string; status: string; expires_at: string } | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SubPlanId>('starter');
  const [payerPhone, setPayerPhone]     = useState('');
  const [payerName, setPayerName]       = useState('');
  const [phoneError, setPhoneError]     = useState('');
  const [payStep, setPayStep]           = useState<'idle' | 'paying' | 'done'>('idle');
  const [paymentId, setPaymentId]       = useState<string | null>(null);

  const loadSub = useCallback(async () => {
    if (!business?.id) { setLoading(false); return; }
    const { data } = await supabase
      .from('subscriptions')
      .select('plan, status, expires_at')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setCurrentSub(data as any);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => {
    loadSub();
    // Pre-fill payer name from user profile
    if (user?.full_name) setPayerName(user.full_name);
    if (user?.phone)     setPayerPhone(user.phone);
  }, [loadSub, user?.full_name, user?.phone]);

  const plan = SUB_PLANS.find(p => p.id === selectedPlan)!;

  const handlePay = async () => {
    const normalized = payerPhone.trim().replace(/\s/g, '');
    if (!normalized || normalized.length < 9) {
      setPhoneError('Enter a valid mobile money number (e.g. 0712345678)');
      return;
    }
    if (!business?.id) {
      Alert.alert('Error', 'No business found. Please sign out and back in.');
      return;
    }
    setPhoneError('');
    setPayStep('paying');

    try {
      const { data: payResult, error: payErr } = await supabase.functions.invoke(
        'initiate-payment',
        {
          body: {
            payment_type:    'subscription',
            channel:         'mobile',
            amount:          plan.price,
            business_id:     business.id,
            idempotency_key: generateIdempotencyKey('sub'),
            payer_phone:     normalized,
            payer_name:      payerName.trim() || user?.full_name || undefined,
            metadata: { plan: selectedPlan },
          },
        },
      );

      if (payErr || !(payResult as any)?.success) {
        Alert.alert(
          'Payment Failed',
          (payResult as any)?.message ?? payErr?.message ?? 'Could not initiate payment. Please try again.',
        );
        setPayStep('idle');
        return;
      }

      const pid = (payResult as any).payment_id ?? null;
      setPaymentId(pid);

      // Insert/update subscription row as pending — webhook will activate it
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      if (currentSub) {
        await supabase
          .from('subscriptions')
          .update({ plan: selectedPlan, status: 'pending', expires_at: expiresAt.toISOString() })
          .eq('business_id', business.id);
      } else {
        const { data: sub } = await supabase
          .from('subscriptions')
          .insert({
            business_id:   business.id,
            plan:          selectedPlan,
            status:        'pending',
            billing_cycle: 'monthly',
            starts_at:     now.toISOString(),
            expires_at:    expiresAt.toISOString(),
          })
          .select('id')
          .single();

        if (pid && sub) {
          await supabase
            .from('payments')
            .update({ subscription_id: sub.id })
            .eq('id', pid);
        }
      }

      setPayStep('done');
      loadSub();
    } catch (e: any) {
      setPayStep('idle');
      Alert.alert('Error', e?.message ?? 'Something went wrong. Please try again.');
    }
  };

  if (loading) return <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Subscription</Text>
      <Text style={styles.sectionSubtitle}>Manage your plan and pay via mobile money</Text>

      {/* Current plan card */}
      <View style={[styles.formCard, { marginBottom: SPACING.md }]}>
        <Text style={styles.subsectionTitle}>Current Plan</Text>
        {currentSub ? (
          <View style={subStyles.planInfoRow}>
            <View style={[subStyles.planBadge, { backgroundColor: COLORS.accent + '18' }]}>
              <Text style={[subStyles.planBadgeText, { color: COLORS.accent }]}>
                {currentSub.plan.charAt(0).toUpperCase() + currentSub.plan.slice(1)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={subStyles.planStatus}>
                Status: <Text style={{ color: currentSub.status === 'active' ? COLORS.success : COLORS.warning, fontWeight: '600' }}>{currentSub.status}</Text>
              </Text>
              <Text style={subStyles.planExpiry}>
                Expires: {new Date(currentSub.expires_at).toLocaleDateString()}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: COLORS.textMuted }]} />
            <Text style={styles.statusText}>No active subscription (Free plan)</Text>
          </View>
        )}
      </View>

      {/* Done state */}
      {payStep === 'done' && (
        <View style={[styles.formCard, { marginBottom: SPACING.md, backgroundColor: COLORS.success + '12', borderWidth: 1, borderColor: COLORS.success + '40' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
            <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text }}>
                USSD push sent!
              </Text>
              <Text style={{ fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 }}>
                Check your phone ({payerPhone}) and enter your mobile money PIN to complete the payment. Your plan will activate automatically.
              </Text>
            </View>
          </View>
          <Button title="Pay Again / Renew" variant="outline" onPress={() => setPayStep('idle')} fullWidth size="sm" style={{ marginTop: SPACING.md }} />
        </View>
      )}

      {payStep !== 'done' && (
        <>
          {/* Plan selector */}
          <View style={[styles.formCard, { marginBottom: SPACING.md }]}>
            <Text style={styles.subsectionTitle}>Choose a Plan</Text>
            {SUB_PLANS.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[subStyles.planOption, selectedPlan === p.id && subStyles.planOptionActive]}
                onPress={() => setSelectedPlan(p.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[subStyles.planOptionName, selectedPlan === p.id && subStyles.planOptionNameActive]}>
                    {p.name}
                  </Text>
                  <Text style={subStyles.planOptionFeatures}>{p.features.join(' · ')}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={[subStyles.planOptionPrice, selectedPlan === p.id && { color: COLORS.accent }]}>
                    TZS {p.price.toLocaleString()}
                  </Text>
                  <Text style={subStyles.planOptionCycle}>/month</Text>
                </View>
                {selectedPlan === p.id && (
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.accent} style={{ marginLeft: SPACING.sm }} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Payment form */}
          <View style={styles.formCard}>
            <Text style={styles.subsectionTitle}>Pay via Mobile Money</Text>
            <Text style={{ fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACING.md }}>
              A USSD push will be sent to your phone. Enter your PIN to authorise TZS {plan.price.toLocaleString()}.
            </Text>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Your Mobile Money Number</Text>
              <TextInput
                style={[styles.editableInput, !!phoneError && { borderColor: COLORS.error }]}
                value={payerPhone}
                onChangeText={t => { setPayerPhone(t); setPhoneError(''); }}
                keyboardType="phone-pad"
                placeholder="0XXXXXXXXX or 255XXXXXXXXX"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                editable={payStep === 'idle'}
              />
              {!!phoneError && <Text style={{ fontSize: FONTS.sizes.xs, color: COLORS.error, marginTop: 4 }}>{phoneError}</Text>}
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Account Holder Name</Text>
              <TextInput
                style={styles.editableInput}
                value={payerName}
                onChangeText={setPayerName}
                placeholder="Full name on the account"
                placeholderTextColor={COLORS.textMuted}
                editable={payStep === 'idle'}
              />
            </View>

            <Button
              title={payStep === 'paying' ? 'Sending USSD push…' : `Pay TZS ${plan.price.toLocaleString()}`}
              onPress={handlePay}
              loading={payStep === 'paying'}
              fullWidth size="lg"
              style={{ marginTop: SPACING.md }}
            />
          </View>
        </>
      )}
    </View>
  );
}

const subStyles = StyleSheet.create({
  planInfoRow:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  planBadge:       { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.full },
  planBadgeText:   { fontSize: FONTS.sizes.sm, fontWeight: '700' },
  planStatus:      { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  planExpiry:      { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 2 },
  planOption: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    marginBottom: SPACING.sm,
  },
  planOptionActive:     { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '0D' },
  planOptionName:       { fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.text },
  planOptionNameActive: { color: COLORS.accent },
  planOptionFeatures:   { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 2 },
  planOptionPrice:      { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  planOptionCycle:      { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  layout: { flex: 1, flexDirection: 'row' },
  layoutMobile: { flexDirection: 'column' },
  // Desktop sidebar menu
  menu: {
    width: 200, backgroundColor: COLORS.surface,
    borderRightWidth: 1, borderRightColor: COLORS.border,
    paddingTop: SPACING.lg, paddingHorizontal: SPACING.md,
  },
  menuTitle: { fontSize: FONTS.sizes['2xl'], fontWeight: '700', color: COLORS.text, marginBottom: SPACING.lg, paddingLeft: SPACING.sm },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.sm, borderRadius: RADIUS.md, marginBottom: SPACING.xs,
  },
  menuItemActive: { backgroundColor: COLORS.background },
  menuLabel: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, marginLeft: SPACING.sm },
  menuLabelActive: { color: COLORS.text, fontWeight: '600' },
  // Mobile tabs
  mobileTabBar: { backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, maxHeight: 52 },
  mobileTab: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.xs,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  mobileTabActive: { borderBottomColor: COLORS.accent },
  mobileTabText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  mobileTabTextActive: { color: COLORS.accent, fontWeight: '600' },
  // Content
  content: { flex: 1, padding: SPACING.lg },
  section: { flex: 1 },
  sectionTitle: { fontSize: FONTS.sizes['2xl'], fontWeight: '700', color: COLORS.text, marginBottom: SPACING.xs },
  sectionSubtitle: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACING.lg },
  subsectionTitle: { fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.text, marginBottom: SPACING.md },
  formCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, ...SHADOWS.sm },
  profileCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl,
    alignItems: 'center', marginBottom: SPACING.md, ...SHADOWS.sm,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: SPACING.sm,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImage: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.border,
  },
  avatarText: { color: COLORS.white, fontSize: FONTS.sizes['2xl'], fontWeight: 'bold' },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.white,
  },
  profileName: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  profileStatus: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACING.md },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  statItem: { alignItems: 'center', paddingHorizontal: SPACING.xl },
  statValue: { fontSize: FONTS.sizes.lg, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  statDivider: { width: 1, height: 30, backgroundColor: COLORS.border },
  formTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.lg },
  fieldWrap: { marginBottom: SPACING.md },
  fieldLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginBottom: SPACING.xs },
  editableInput: {
    backgroundColor: COLORS.background, borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.base, color: COLORS.text,
  },
  notifHeader: {
    flexDirection: 'row', alignItems: 'center', paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: SPACING.sm,
  },
  notifHeadText: { fontSize: FONTS.sizes.xs, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase' },
  notifRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm },
  notifLabel: { flex: 1, fontSize: FONTS.sizes.base, color: COLORS.text },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.sm },
  settingLabel: { fontSize: FONTS.sizes.base, color: COLORS.text, fontWeight: '500' },
  dividerLine: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.lg },
  alertRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: COLORS.warningLight, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md,
  },
  alertSub: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },

  // Payment method selector
  payMethodRow:         { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  payMethodCard: {
    flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xs, paddingVertical: SPACING.md, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background,
  },
  payMethodCardActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '10' },
  payMethodLabel:       { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, fontWeight: '600', textAlign: 'center' },
  payMethodLabelActive: { color: COLORS.accent },

  // Bank picker button inside TextInput slot
  bankPickerBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bankPickerSelected:    { flex: 1, fontSize: FONTS.sizes.base, color: COLORS.text },
  bankPickerPlaceholder: { flex: 1, fontSize: FONTS.sizes.base, color: COLORS.textMuted },

  // Bank picker modal
  bankModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bankModalContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    paddingBottom: SPACING['2xl'],
    maxHeight: '75%',
  },
  bankModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  bankModalTitle:  { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  bankModalSearch: {
    margin: SPACING.md, padding: SPACING.sm,
    backgroundColor: COLORS.background, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    fontSize: FONTS.sizes.base, color: COLORS.text,
  },
  bankModalItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1, borderBottomColor: COLORS.border + '60',
  },
  bankModalItemActive: { backgroundColor: COLORS.accent + '10' },
  bankModalCode: { fontSize: FONTS.sizes.xs, fontWeight: '700', color: COLORS.textSecondary, width: 72 },
  bankModalName: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text },

  // Language pill selector
  langRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.xl },
  langPill:          { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  langPillActive:    { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '18' },
  langPillText:      { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontWeight: '500' },
  langPillTextActive:{ color: COLORS.accent, fontWeight: '700' },
  currencyName:      { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 2, textAlign: 'center' },

  // Status row (payment config)
  statusRow:   { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  statusDot:   { width: 8, height: 8, borderRadius: 4 },
  statusText:  { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },

  // Session card (security)
  sessionCard:     { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.background, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  sessionIconWrap: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.accent + '15', alignItems: 'center', justifyContent: 'center' },
  sessionDevice:   { fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.text },
  sessionEmail:    { fontSize: FONTS.sizes.sm,  color: COLORS.textSecondary, marginTop: 2 },
  sessionBadge:    { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.xs },
  sessionBadgeText:{ fontSize: FONTS.sizes.xs, color: COLORS.success, fontWeight: '500' },
});

