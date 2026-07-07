import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { COLORS, SPACING, FONTS, RADIUS } from '../../lib/constants';
import { useAuth } from '../../context/AuthContext';

export function UpdatePasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { clearPasswordRecovery } = useAuth();

  const handleUpdate = async () => {
    if (!password || !confirmPassword) {
      Alert.alert('Required', 'Please fill in both fields.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Success', 'Your password has been updated.', [
        { text: 'OK', onPress: () => clearPasswordRecovery?.() }
      ]);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <LinearGradient colors={[COLORS.primary, '#0F2318']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="lock-closed-outline" size={32} color={COLORS.accent} />
            </View>
            <Text style={styles.title}>Create New Password</Text>
            <Text style={styles.subtitle}>
              Please enter your new password below.
            </Text>
            <Input
              label="New Password"
              placeholder="Enter new password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              leftIcon="key-outline"
            />
            <Input
              label="Confirm Password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              leftIcon="key-outline"
            />
            <Button title="Update Password" onPress={handleUpdate} loading={loading} fullWidth size="lg" />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.primary },
  content: { flexGrow: 1, padding: SPACING.xl, justifyContent: 'center', alignItems: 'center' },
  inner: { width: '100%', maxWidth: 460 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.xl },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#FEF3C7',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: { fontSize: FONTS.sizes['2xl'], fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  subtitle: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, marginBottom: SPACING.xl, lineHeight: 22 },
});
