import { Platform } from 'react-native';

export const COLORS = {
  primary: '#0D9488',        // Vibrant Teal
  primaryLight: '#14B8A6',
  primaryDark: '#0F766E',
  accent: '#F59E0B',         // Warm Amber
  accentLight: '#FBBF24',
  accentDark: '#D97706',
  background: '#F8FAFC',     // Slate-50 for a clean modern backdrop
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',     // Slate-100
  surfaceHover: '#F1F5F9',
  text: '#0F172A',           // Slate-900
  textSecondary: '#475569',  // Slate-600
  textMuted: '#94A3B8',      // Slate-400
  border: '#E2E8F0',         // Slate-200
  borderLight: '#F1F5F9',    // Slate-100
  success: '#10B981',        // Emerald-500
  successLight: '#D1FAE5',
  error: '#EF4444',          // Red-500
  errorLight: '#FEE2E2',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  info: '#3B82F6',           // Blue-500
  infoLight: '#DBEAFE',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(15, 23, 42, 0.4)', // Slightly cooler dark overlay
};

export const FONTS = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
  sizes: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 19,
    xl: 22,
    '2xl': 26,
    '3xl': 32,
    '4xl': 40,
  },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
};

export const RADIUS = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  '2xl': 36,
  full: 999,
};

export const SHADOWS = {
  xs: Platform.select({
    web: { boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)' },
    default: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1,
    },
  }) as object,
  sm: Platform.select({
    web: { boxShadow: '0 4px 6px -1px rgba(15, 23, 42, 0.05), 0 2px 4px -2px rgba(15, 23, 42, 0.05)' },
    default: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
  }) as object,
  md: Platform.select({
    web: { boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04)' },
    default: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 4,
    },
  }) as object,
  lg: Platform.select({
    web: { boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.04)' },
    default: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 20,
      elevation: 8,
    },
  }) as object,
  xl: Platform.select({
    web: { boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.15)' },
    default: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.12,
      shadowRadius: 30,
      elevation: 14,
    },
  }) as object,
};

/** Gradient color stops for expo-linear-gradient */
export const GRADIENTS = {
  primary:   ['#14B8A6', '#0D9488'] as const,
  primaryV:  ['#0D9488', '#0F766E'] as const,
  accent:    ['#FBBF24', '#F59E0B'] as const,
  success:   ['#34D399', '#10B981'] as const,
  error:     ['#F87171', '#EF4444'] as const,
  info:      ['#60A5FA', '#3B82F6'] as const,
  surface:   ['#FFFFFF', '#F8FAFC'] as const,
};

/** Standard animation presets */
export const ANIM = {
  pressDuration: 120,
  springFast: { tension: 300, friction: 20 },
  springBouncy: { tension: 220, friction: 12 },
};

// Responsive breakpoints (in dp / logical pixels)
export const BREAKPOINTS = {
  mobile: 480,   // < 480 → phone portrait
  tablet: 768,   // 480–767 → phone landscape / small tablet
  desktop: 1024, // ≥ 768 → show persistent sidebar
};

export const SUBSCRIPTION_PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'TZS',
    features: ['Up to 50 products', '10 transactions/day', 'Basic reports'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 15000,
    currency: 'TZS',
    features: ['Up to 200 products', '100 transactions/day', 'Full reports', '2 staff accounts'],
  },
  {
    id: 'business',
    name: 'Business',
    price: 35000,
    currency: 'TZS',
    features: ['Unlimited products', 'Unlimited transactions', 'All reports', '10 staff accounts', 'Customer management'],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 75000,
    currency: 'TZS',
    features: ['Everything in Business', 'AI predictions', 'Priority support', 'Multi-branch (coming soon)'],
  },
];

/**
 * Always null. Kept only for compatibility with existing style arrays.
 * This guarantees no outline-related style key can ever be sent to native.
 * Usage:  style={[styles.input, WEB_OUTLINE_NONE]}
 */
export const WEB_OUTLINE_NONE: null = null;
