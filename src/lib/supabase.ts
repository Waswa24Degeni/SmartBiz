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

// On web use localStorage; on native use AsyncStorage
let storage: any;
if (Platform.OS === 'web') {
  storage = localStorage;
} else {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  storage = AsyncStorage;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

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
    return;
  }

  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  const keys: string[] = await AsyncStorage.getAllKeys();
  const keysToDelete = keys.filter((key) => authKeyPattern.test(key));
  if (keysToDelete.length > 0) {
    await AsyncStorage.multiRemove(keysToDelete);
  }
}
