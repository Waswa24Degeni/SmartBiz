// Supabase client configuration
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

// Only import the URL polyfill on native — it breaks on web
if (Platform.OS !== 'web') {
  require('react-native-url-polyfill/auto');
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://your-project.supabase.co';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_KEY ??
  'your-anon-key';

// On web use localStorage; on native use SecureStore
let storage: any;
if (Platform.OS === 'web') {
  storage = localStorage;
} else {
  const SecureStore = require('expo-secure-store');
  storage = {
    getItem: (key: string) => SecureStore.getItemAsync(key),
    setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
    removeItem: (key: string) => SecureStore.deleteItemAsync(key),
  };
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

export const SESSION_ACTIVITY_KEY = 'smartenterprise_last_activity';

export async function updateLastActivity(): Promise<void> {
  const now = new Date().toISOString();
  if (Platform.OS === 'web') {
    localStorage.setItem(SESSION_ACTIVITY_KEY, now);
  } else {
    const SecureStore = require('expo-secure-store');
    await SecureStore.setItemAsync(SESSION_ACTIVITY_KEY, now);
  }
}

export async function getLastActivity(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(SESSION_ACTIVITY_KEY);
  } else {
    const SecureStore = require('expo-secure-store');
    return await SecureStore.getItemAsync(SESSION_ACTIVITY_KEY);
  }
}

export async function clearStoredAuthSession(): Promise<void> {
  const authKeyPattern = /(^sb-.*-auth-token$)|(^supabase\.auth\.token$)/;

  if (Platform.OS === 'web') {
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && authKeyPattern.test(key)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem(SESSION_ACTIVITY_KEY);
    return;
  }

  // On Native, we can't easily iterate all SecureStore keys without knowing them.
  // We'll delete the common known ones based on the URL, plus a fallback cleanup.
  try {
    const SecureStore = require('expo-secure-store');
    // Supabase forms the key based on the URL host
    const urlObj = new URL(supabaseUrl);
    const hostKey = urlObj.hostname.split('.')[0];
    await SecureStore.deleteItemAsync(`sb-${hostKey}-auth-token`);
    await SecureStore.deleteItemAsync('supabase.auth.token');
    await SecureStore.deleteItemAsync(SESSION_ACTIVITY_KEY);
  } catch (e) {
    console.warn('Error clearing SecureStore:', e);
  }
}
