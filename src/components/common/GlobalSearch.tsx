import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, FlatList,
  ActivityIndicator, useWindowDimensions, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS, BREAKPOINTS } from '../../lib/constants';

interface SearchResult {
  id: string;
  type: 'product' | 'customer' | 'sale' | 'expense' | 'staff';
  title: string;
  subtitle: string;
  icon: string;
  color: string;
}

interface GlobalSearchProps {
  visible: boolean;
  onClose: () => void;
  onNavigate: (route: string) => void;
}

const TYPE_CONFIG = {
  product:  { icon: 'cube-outline',          color: COLORS.accent,    route: 'Inventory' },
  customer: { icon: 'people-outline',        color: COLORS.success,   route: 'Customers' },
  sale:     { icon: 'cart-outline',           color: COLORS.primary,   route: 'Bills' },
  expense:  { icon: 'wallet-outline',        color: '#EF4444',        route: 'Expenses' },
  staff:    { icon: 'person-outline',         color: '#8B5CF6',        route: 'Staff' },
};

export function GlobalSearch({ visible, onClose, onNavigate }: GlobalSearchProps) {
  const { business } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Focus input when modal opens
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 200);
      setQuery('');
      setResults([]);
      setSearched(false);
    }
  }, [visible]);

  const doSearch = useCallback(async (q: string) => {
    if (!business?.id || q.trim().length < 2) {
      setResults([]);
      setSearched(q.trim().length >= 2);
      return;
    }

    setLoading(true);
    setSearched(true);
    const term = `%${q.trim()}%`;
    const allResults: SearchResult[] = [];

    try {
      // Products
      const { data: products } = await supabase
        .from('products')
        .select('id, name, selling_price, stock_quantity')
        .eq('business_id', business.id)
        .ilike('name', term)
        .limit(5);
      (products ?? []).forEach((p: any) => {
        allResults.push({
          id: p.id,
          type: 'product',
          title: p.name,
          subtitle: `TZS ${Number(p.selling_price).toLocaleString()} • Stock: ${p.stock_quantity}`,
          icon: TYPE_CONFIG.product.icon,
          color: TYPE_CONFIG.product.color,
        });
      });

      // Customers
      const { data: customers } = await supabase
        .from('customers')
        .select('id, full_name, phone')
        .eq('business_id', business.id)
        .or(`full_name.ilike.${term},phone.ilike.${term}`)
        .limit(5);
      (customers ?? []).forEach((c: any) => {
        allResults.push({
          id: c.id,
          type: 'customer',
          title: c.full_name,
          subtitle: c.phone ?? 'No phone',
          icon: TYPE_CONFIG.customer.icon,
          color: TYPE_CONFIG.customer.color,
        });
      });

      // Sales (by order number)
      const { data: sales } = await supabase
        .from('sales')
        .select('id, order_number, total, status')
        .eq('business_id', business.id)
        .ilike('order_number', term)
        .limit(5);
      (sales ?? []).forEach((s: any) => {
        allResults.push({
          id: s.id,
          type: 'sale',
          title: `Order #${s.order_number}`,
          subtitle: `TZS ${Number(s.total).toLocaleString()} • ${s.status}`,
          icon: TYPE_CONFIG.sale.icon,
          color: TYPE_CONFIG.sale.color,
        });
      });

      // Expenses
      const { data: expenses } = await supabase
        .from('expenses')
        .select('id, title, amount')
        .eq('business_id', business.id)
        .ilike('title', term)
        .limit(5);
      (expenses ?? []).forEach((e: any) => {
        allResults.push({
          id: e.id,
          type: 'expense',
          title: e.title,
          subtitle: `TZS ${Number(e.amount).toLocaleString()}`,
          icon: TYPE_CONFIG.expense.icon,
          color: TYPE_CONFIG.expense.color,
        });
      });

      // Staff
      const { data: staff } = await supabase
        .from('users')
        .select('id, full_name, email, role')
        .eq('business_id', business.id)
        .or(`full_name.ilike.${term},email.ilike.${term}`)
        .limit(5);
      (staff ?? []).forEach((s: any) => {
        allResults.push({
          id: s.id,
          type: 'staff',
          title: s.full_name,
          subtitle: `${s.role} • ${s.email ?? ''}`,
          icon: TYPE_CONFIG.staff.icon,
          color: TYPE_CONFIG.staff.color,
        });
      });

      setResults(allResults);
    } catch (err) {
      console.error('[GlobalSearch]', err);
    } finally {
      setLoading(false);
    }
  }, [business?.id]);

  // Debounced search
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const handleChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(text), 300);
  };

  const handleResultPress = (item: SearchResult) => {
    const config = TYPE_CONFIG[item.type];
    onClose();
    onNavigate(config.route);
  };

  const renderResult = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity style={styles.resultRow} onPress={() => handleResultPress(item)} activeOpacity={0.7}>
      <View style={[styles.resultIcon, { backgroundColor: item.color + '15' }]}>
        <Ionicons name={item.icon as any} size={18} color={item.color} />
      </View>
      <View style={styles.resultInfo}>
        <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.resultSub} numberOfLines={1}>{item.subtitle}</Text>
      </View>
      <View style={[styles.typeBadge, { backgroundColor: item.color + '12' }]}>
        <Text style={[styles.typeBadgeText, { color: item.color }]}>{item.type}</Text>
      </View>
    </TouchableOpacity>
  );

  // Group results by type
  const groupedTypes = useMemo(() => {
    const types = new Set(results.map(r => r.type));
    return Array.from(types);
  }, [results]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, isMobile && styles.containerMobile]}>
          {/* Search Input */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={COLORS.textMuted} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              value={query}
              onChangeText={handleChange}
              placeholder="Search products, customers, orders, expenses, staff..."
              placeholderTextColor={COLORS.textMuted}
              returnKeyType="search"
              onSubmitEditing={() => doSearch(query)}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setSearched(false); }}>
                <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>ESC</Text>
            </TouchableOpacity>
          </View>

          {/* Quick filters */}
          {groupedTypes.length > 0 && (
            <View style={styles.typesRow}>
              {groupedTypes.map(t => {
                const count = results.filter(r => r.type === t).length;
                const config = TYPE_CONFIG[t];
                return (
                  <View key={t} style={[styles.typeChip, { borderColor: config.color + '40' }]}>
                    <Ionicons name={config.icon as any} size={12} color={config.color} />
                    <Text style={[styles.typeChipText, { color: config.color }]}>{t} ({count})</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Results */}
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          ) : results.length > 0 ? (
            <FlatList
              data={results}
              keyExtractor={item => `${item.type}-${item.id}`}
              renderItem={renderResult}
              contentContainerStyle={styles.resultsList}
              keyboardShouldPersistTaps="handled"
            />
          ) : searched ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="search-outline" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No results found</Text>
              <Text style={styles.emptyText}>Try a different search term</Text>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="search" size={40} color={COLORS.border} />
              <Text style={styles.emptyTitle}>Search Across Your Business</Text>
              <Text style={styles.emptyText}>
                Find products, customers, orders, expenses, and staff members
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
    paddingTop: 80,
    paddingHorizontal: SPACING.lg,
  },
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    maxHeight: '75%',
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
    ...SHADOWS.xl,
    overflow: 'hidden',
  },
  containerMobile: {
    maxWidth: '100%',
    maxHeight: '80%',
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    fontSize: FONTS.sizes.base,
    color: COLORS.text,
    paddingVertical: SPACING.xs,
  } as any,
  closeBtn: {
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeBtnText: { fontSize: 10, color: COLORS.textMuted, fontWeight: '700' },

  typesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  typeChipText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },

  resultsList: { padding: SPACING.sm },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    marginBottom: 2,
  },
  resultIcon: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  resultInfo: { flex: 1 },
  resultTitle: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text },
  resultSub: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 1 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full },
  typeBadgeText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },

  loadingWrap: { padding: SPACING['2xl'], alignItems: 'center', gap: SPACING.sm },
  loadingText: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted },

  emptyWrap: { padding: SPACING['2xl'], alignItems: 'center', gap: SPACING.sm },
  emptyTitle: { fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.text },
  emptyText: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted, textAlign: 'center', maxWidth: 280 },
});
