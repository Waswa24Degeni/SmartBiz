import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

interface SystemConfig {
  app_name: string;
  support_email: string;
  support_phone: string;
  default_currency: string;
  allow_new_registrations: boolean;
  require_email_verification: boolean;
  trial_days: string;
  auto_expire_subscriptions: boolean;
  maintenance_mode: boolean;
}

const DEFAULT_CONFIG: SystemConfig = {
  app_name: 'SmartBiz TZ',
  support_email: 'support@smartbiz.tz',
  support_phone: '+255 000 000 000',
  default_currency: 'TZS',
  allow_new_registrations: true,
  require_email_verification: false,
  trial_days: '14',
  auto_expire_subscriptions: false,
  maintenance_mode: false,
};

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.labelWrap}>
        <Text style={rowStyles.label}>{label}</Text>
        {!!hint && <Text style={rowStyles.hint}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceAlt,
  },
  labelWrap: { flex: 1, marginRight: SPACING.base },
  label: { fontSize: FONTS.sizes.sm, color: COLORS.text, fontWeight: '500' },
  hint: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 2 },
});

export function AdminSettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<SystemConfig>(DEFAULT_CONFIG);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('system_config')
      .select('key, value');

    if (error || !data) {
      setLoading(false);
      return;
    }

    const map: Record<string, string> = {};
    for (const row of data) {
      map[row.key] = row.value ?? '';
    }

    setConfig({
      app_name: map.app_name ?? DEFAULT_CONFIG.app_name,
      support_email: map.support_email ?? DEFAULT_CONFIG.support_email,
      support_phone: map.support_phone ?? DEFAULT_CONFIG.support_phone,
      default_currency: map.default_currency ?? DEFAULT_CONFIG.default_currency,
      allow_new_registrations: map.allow_new_registrations !== 'false',
      require_email_verification: map.require_email_verification === 'true',
      trial_days: map.trial_days ?? DEFAULT_CONFIG.trial_days,
      auto_expire_subscriptions: map.auto_expire_subscriptions === 'true',
      maintenance_mode: map.maintenance_mode === 'true',
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = async () => {
    setSaving(true);
    const rows = [
      { key: 'app_name', value: config.app_name },
      { key: 'support_email', value: config.support_email },
      { key: 'support_phone', value: config.support_phone },
      { key: 'default_currency', value: config.default_currency },
      { key: 'allow_new_registrations', value: String(config.allow_new_registrations) },
      { key: 'require_email_verification', value: String(config.require_email_verification) },
      { key: 'trial_days', value: config.trial_days },
      { key: 'auto_expire_subscriptions', value: String(config.auto_expire_subscriptions) },
      { key: 'maintenance_mode', value: String(config.maintenance_mode) },
    ];

    const { error } = await supabase
      .from('system_config')
      .upsert(rows, { onConflict: 'key' });

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    Alert.alert('Saved', 'Settings updated successfully.');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* General */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>General</Text>

        <SettingRow label="App Name">
          <TextInput
            style={styles.input}
            value={config.app_name}
            onChangeText={v => setConfig(c => ({ ...c, app_name: v }))}
            placeholder="SmartBiz TZ"
            placeholderTextColor={COLORS.textMuted}
          />
        </SettingRow>

        <SettingRow label="Default Currency">
          <TextInput
            style={[styles.input, { width: 90 }]}
            value={config.default_currency}
            onChangeText={v => setConfig(c => ({ ...c, default_currency: v }))}
            placeholder="TZS"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="characters"
          />
        </SettingRow>
      </View>

      {/* Support Contact */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Support Contact</Text>

        <SettingRow label="Support Email">
          <TextInput
            style={styles.input}
            value={config.support_email}
            onChangeText={v => setConfig(c => ({ ...c, support_email: v }))}
            placeholder="support@smartbiz.tz"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </SettingRow>

        <SettingRow label="Support Phone">
          <TextInput
            style={styles.input}
            value={config.support_phone}
            onChangeText={v => setConfig(c => ({ ...c, support_phone: v }))}
            placeholder="+255 000 000 000"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="phone-pad"
          />
        </SettingRow>
      </View>

      {/* Registrations */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Registrations</Text>

        <SettingRow
          label="Allow New Business Registrations"
          hint="When off, new sign-ups will be blocked."
        >
          <Switch
            value={config.allow_new_registrations}
            onValueChange={v => setConfig(c => ({ ...c, allow_new_registrations: v }))}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
            thumbColor={COLORS.white}
          />
        </SettingRow>

        <SettingRow label="Require Email Verification">
          <Switch
            value={config.require_email_verification}
            onValueChange={v => setConfig(c => ({ ...c, require_email_verification: v }))}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
            thumbColor={COLORS.white}
          />
        </SettingRow>
      </View>

      {/* Subscriptions */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Subscriptions</Text>

        <SettingRow label="Free Trial Period (days)">
          <TextInput
            style={[styles.input, { width: 80, textAlign: 'center' }]}
            value={config.trial_days}
            onChangeText={v =>
              setConfig(c => ({ ...c, trial_days: v.replace(/[^0-9]/g, '') }))
            }
            keyboardType="number-pad"
            placeholder="14"
            placeholderTextColor={COLORS.textMuted}
          />
        </SettingRow>

        <SettingRow
          label="Auto-expire Subscriptions"
          hint="Automatically mark subscriptions as expired past their end date."
        >
          <Switch
            value={config.auto_expire_subscriptions}
            onValueChange={v =>
              setConfig(c => ({ ...c, auto_expire_subscriptions: v }))
            }
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
            thumbColor={COLORS.white}
          />
        </SettingRow>
      </View>

      {/* System */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>System</Text>

        <SettingRow
          label="Maintenance Mode"
          hint="When on, users see a maintenance notice on login."
        >
          <Switch
            value={config.maintenance_mode}
            onValueChange={v => setConfig(c => ({ ...c, maintenance_mode: v }))}
            trackColor={{ false: COLORS.border, true: COLORS.error }}
            thumbColor={COLORS.white}
          />
        </SettingRow>
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>About</Text>
        {[
          { label: 'App Version', value: '1.0.0' },
          { label: 'Platform', value: 'SmartBiz TZ' },
          { label: 'Database', value: 'Supabase (PostgreSQL)' },
        ].map(row => (
          <View key={row.label} style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>{row.label}</Text>
            <Text style={styles.aboutValue}>{row.value}</Text>
          </View>
        ))}
      </View>

      {/* Save */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && { opacity: 0.7 }]}
        onPress={saveConfig}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={COLORS.white} size="small" />
        ) : (
          <>
            <Ionicons name="save-outline" size={16} color={COLORS.white} />
            <Text style={styles.saveBtnText}>Save Settings</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: SPACING.xl, gap: SPACING.base },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionHeader: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
    paddingBottom: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 2,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
    backgroundColor: COLORS.surfaceAlt,
    minWidth: 160,
    flex: 1,
  },

  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceAlt,
  },
  aboutLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  aboutValue: { fontSize: FONTS.sizes.sm, color: COLORS.text, fontWeight: '600' },

  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.base,
    ...(SHADOWS.sm as object),
  },
  saveBtnText: { color: COLORS.white, fontWeight: '700', fontSize: FONTS.sizes.base },
});
