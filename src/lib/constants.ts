// Design tokens matching the ServePoint/SmartBiz UI design system
import { Platform } from 'react-native';

export const COLORS = {
  primary: '#1B3A2D',        // Deep forest green – sidebar / primary actions
  primaryLight: '#2C6E4F',   // Lighter green for hover / pressed states
  primaryDark: '#122A20',    // Darker for deeper shadows
  accent: '#C49A2A',         // Gold/amber accent
  accentLight: '#E8B84B',
  accentDark: '#A67C1E',
  background: '#F0F2F1',     // Slightly cooler light grey
  surface: '#FFFFFF',
  surfaceAlt: '#F7F8F7',
  surfaceHover: '#F1F5F2',   // Subtle green-tinted hover bg
  text: '#111827',           // Slightly richer near-black
  textSecondary: '#4B5563',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  success: '#059669',
  successLight: '#D1FAE5',
  error: '#DC2626',
  errorLight: '#FEE2E2',
  warning: '#D97706',
  warningLight: '#FEF3C7',
  info: '#2563EB',
  infoLight: '#DBEAFE',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.45)',
};

export const FONTS = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
  sizes: {
    xs: 10,
    sm: 12,
    base: 14,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 32,
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
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  '2xl': 24,
  full: 999,
};

export const SHADOWS = {
  xs: Platform.select({
    web: { boxShadow: '0 1px 2px rgba(0,0,0,0.04)' },
    default: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1,
    },
  }) as object,
  sm: Platform.select({
    web: { boxShadow: '0 1px 4px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)' },
    default: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.07,
      shadowRadius: 4,
      elevation: 2,
    },
  }) as object,
  md: Platform.select({
    web: { boxShadow: '0 4px 8px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)' },
    default: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
  }) as object,
  lg: Platform.select({
    web: { boxShadow: '0 8px 20px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)' },
    default: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 8,
    },
  }) as object,
  xl: Platform.select({
    web: { boxShadow: '0 16px 40px rgba(0,0,0,0.14), 0 4px 12px rgba(0,0,0,0.08)' },
    default: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 24,
      elevation: 14,
    },
  }) as object,
};

/** Gradient color stops for expo-linear-gradient */
export const GRADIENTS = {
  primary:   ['#2C6E4F', '#1B3A2D'] as const,
  primaryV:  ['#1B3A2D', '#122A20'] as const,
  accent:    ['#E8B84B', '#C49A2A'] as const,
  success:   ['#34D399', '#059669'] as const,
  error:     ['#F87171', '#DC2626'] as const,
  info:      ['#60A5FA', '#2563EB'] as const,
  surface:   ['#FFFFFF', '#F7F8F7'] as const,
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
