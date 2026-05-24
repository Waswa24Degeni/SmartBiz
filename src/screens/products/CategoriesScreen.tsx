import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Image,
  ActivityIndicator, Alert, Modal, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Category } from '../../types';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS, BREAKPOINTS } from '../../lib/constants';
import { useRealtimeSubscription } from '../../lib/hooks';
import { getPosCategoryTemplates, getPosLabel, getPosType } from '../../lib/inventory';

/** Map a category name to an appropriate Ionicons icon */
function getCategoryIcon(name: string): string {
  const n = (name ?? '').toLowerCase();
  if (n.includes('drink') || n.includes('beverage') || n.includes('juice') || n.includes('water')) return 'wine-outline';
  if (n.includes('food') || n.includes('meal') || n.includes('snack') || n.includes('lunch') || n.includes('dinner')) return 'fast-food-outline';
  if (n.includes('breakfast') || n.includes('coffee') || n.includes('tea') || n.includes('cake')) return 'cafe-outline';
  if (n.includes('meat') || n.includes('chicken') || n.includes('fish') || n.includes('beef')) return 'nutrition-outline';
  if (n.includes('vegetable') || n.includes('fruit') || n.includes('salad')) return 'leaf-outline';
  if (n.includes('dairy') || n.includes('milk') || n.includes('cheese') || n.includes('egg')) return 'egg-outline';
  if (n.includes('phone') || n.includes('mobile') || n.includes('tablet') || n.includes('laptop')) return 'phone-portrait-outline';
  if (n.includes('electronic') || n.includes('gadget') || n.includes('computer')) return 'hardware-chip-outline';
  if (n.includes('cloth') || n.includes('shirt') || n.includes('trouser') || n.includes('dress') || n.includes('fashion')) return 'shirt-outline';
  if (n.includes('shoe') || n.includes('footwear') || n.includes('sandal')) return 'footsteps-outline';
  if (n.includes('medicine') || n.includes('drug') || n.includes('tablet') || n.includes('capsule')) return 'medkit-outline';
  if (n.includes('beauty') || n.includes('cosmetic') || n.includes('skin') || n.includes('hair')) return 'color-palette-outline';
  if (n.includes('cleaning') || n.includes('detergent') || n.includes('soap')) return 'sparkles-outline';
  if (n.includes('stationery') || n.includes('book') || n.includes('pen') || n.includes('paper')) return 'book-outline';
  if (n.includes('toy') || n.includes('baby') || n.includes('kids') || n.includes('children')) return 'happy-outline';
  if (n.includes('furniture') || n.includes('chair') || n.includes('table') || n.includes('bed')) return 'bed-outline';
  if (n.includes('tool') || n.includes('hardware') || n.includes('spare') || n.includes('part')) return 'build-outline';
  if (n.includes('sweet') || n.includes('candy') || n.includes('chocolate') || n.includes('biscuit')) return 'ice-cream-outline';
  if (n.includes('service') || n.includes('repair') || n.includes('plumbing')) return 'hammer-outline';
  return 'pricetag-outline'; // default
}

interface Props {
  onCategorySelect: (category: Category) => void;
}

export function CategoriesScreen({ onCategorySelect }: Props) {
  const { business } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;
  const isCompact = width < 520;
  const numColumns = isMobile ? 2 : width < BREAKPOINTS.desktop ? 3 : 4;
  const gridHorizontalPadding = SPACING.base;
  const cardOuterGap = SPACING.sm * 2;
  const cardWidth = Math.max(
    120,
    (width - gridHorizontalPadding * 2 - cardOuterGap * numColumns) / numColumns,
  );

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [saving, setSaving] = useState(false);

  const posType = getPosType(business?.category);
  const posLabel = getPosLabel(posType);

  const fetchCategories = useCallback(async (silent = false) => {
    if (!business?.id) { if (!silent) setLoading(false); return; }
    if (!silent) setLoading(true);
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('business_id', business.id)
      .order('name');
    setCategories((data as Category[]) ?? []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  useRealtimeSubscription('categories-rt', 'categories', () => fetchCategories(true), !!business?.id);

  const openAdd = () => {
    setEditingCategory(null);
    setCategoryName('');
    setModalVisible(true);
  };

  const openEdit = (cat: Category) => {
    setEditingCategory(cat);
    setCategoryName(cat.name);
    setModalVisible(true);
  };

  const handleDelete = (cat: Category) => {
    Alert.alert(
      'Delete Category',
      `Delete "${cat.name}"? Products in this category will be unlinked.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('categories').delete().eq('id', cat.id);
            if (error) Alert.alert('Error', error.message);
            else fetchCategories();
          },
        },
      ],
    );
  };

  const handleSave = async () => {
    const name = categoryName.trim();
    if (!name) { Alert.alert('Required', 'Category name cannot be empty'); return; }
    if (!business?.id) return;
    setSaving(true);
    if (editingCategory) {
      const { error } = await supabase
        .from('categories')
        .update({ name })
        .eq('id', editingCategory.id);
      if (error) Alert.alert('Error', error.message);
    } else {
      const { error } = await supabase
        .from('categories')
        .insert({ business_id: business.id, name });
      if (error) Alert.alert('Error', error.message);
    }
    setSaving(false);
    setModalVisible(false);
    fetchCategories();
  };

  const handleQuickSetup = async () => {
    if (!business?.id) return;
    const templates = getPosCategoryTemplates(posType);
    if (!templates.length) return;

    const existing = new Set(categories.map((c) => c.name.toLowerCase()));
    const missing = templates.filter((name) => !existing.has(name.toLowerCase()));

    if (!missing.length) {
      Alert.alert('Up to date', 'Recommended categories already exist.');
      return;
    }

    const { error } = await supabase
      .from('categories')
      .insert(missing.map((name) => ({ business_id: business.id, name })));

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    Alert.alert('Success', `${missing.length} categories created for ${posLabel}.`);
    fetchCategories();
  };

  const filtered = categories.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={[styles.searchBar, isCompact && styles.searchBarCompact]}>
        <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search categories..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor={COLORS.textMuted}
        />
      </View>

      <View style={[styles.topBar, isCompact && styles.topBarCompact]}>
        <View>
          <Text style={[styles.title, isCompact && styles.titleCompact]}>Categories ({categories.length})</Text>
          <Text style={styles.posHint}>{posLabel}</Text>
        </View>
        <View style={[styles.topActions, isCompact && styles.topActionsCompact]}>
          <TouchableOpacity style={[styles.seedBtn, isCompact && styles.seedBtnCompact]} onPress={handleQuickSetup}>
            <Ionicons name="sparkles-outline" size={14} color={COLORS.primary} />
            <Text style={styles.seedBtnText}>Quick Setup</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.addBtn, isCompact && styles.addBtnCompact]} onPress={openAdd}>
            <Ionicons name="add" size={20} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="grid-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>
            {search ? 'No categories match your search' : 'No categories yet'}
          </Text>
          {!search && (
            <Text style={styles.emptySubText}>Tap the + button to add your first category</Text>
          )}
        </View>
      ) : (
        <FlatList
          key={`grid-${numColumns}`}
          data={filtered}
          keyExtractor={item => item.id}
          numColumns={numColumns}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={numColumns > 1 ? { justifyContent: 'flex-start' } : undefined}
          renderItem={({ item, index }) => (
            <View style={{ width: cardWidth, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm }}>
              <TouchableOpacity
                style={[styles.categoryCard, index === 0 && styles.categoryCardSelected]}
                onPress={() => onCategorySelect(item)}
                onLongPress={() =>
                  Alert.alert(item.name, 'Choose an action', [
                    { text: 'Edit', onPress: () => openEdit(item) },
                    { text: 'Delete', style: 'destructive', onPress: () => handleDelete(item) },
                    { text: 'Cancel', style: 'cancel' },
                  ])
                }
                activeOpacity={0.85}
              >
                <View style={[styles.categoryImage, index === 0 && styles.categoryImageSelected]}>
                  <Ionicons
                    name={getCategoryIcon(item.name) as any}
                    size={36}
                    color={index === 0 ? COLORS.white : COLORS.textMuted}
                  />
                </View>
                <Text style={[styles.categoryName, index === 0 && styles.categoryNameSelected]} numberOfLines={2}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* Add / Edit modal */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, isCompact && styles.modalBoxCompact]}>
            <Text style={styles.modalTitle}>{editingCategory ? 'Edit Category' : 'New Category'}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Category name"
              placeholderTextColor={COLORS.textMuted}
              value={categoryName}
              onChangeText={setCategoryName}
              autoFocus
              onSubmitEditing={handleSave}
            />
            <View style={[styles.modalBtns, isCompact && styles.modalBtnsCompact]}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, saving && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color={COLORS.white} size="small" />
                  : <Text style={styles.modalSaveText}>{editingCategory ? 'Save' : 'Create'}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    margin: SPACING.base, ...SHADOWS.sm,
    minHeight: 44,
  },
  searchBarCompact: {
    marginHorizontal: SPACING.md,
  },
  searchInput: { flex: 1, marginLeft: SPACING.sm, fontSize: FONTS.sizes.base, color: COLORS.text },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.base, marginBottom: SPACING.md,
  },
  topBarCompact: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  title: { fontSize: FONTS.sizes['2xl'], fontWeight: '700', color: COLORS.text },
  titleCompact: { fontSize: FONTS.sizes.xl },
  posHint: { marginTop: 2, fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  topActionsCompact: { width: '100%' },
  seedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    minHeight: 40,
  },
  seedBtnCompact: {
    flex: 1,
    justifyContent: 'center',
  },
  seedBtnText: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center',
  },
  addBtnCompact: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  grid: { paddingHorizontal: SPACING.base, paddingBottom: 40 },
  categoryCard: {
    width: '100%', backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg, alignItems: 'center', padding: SPACING.base,
    ...SHADOWS.sm, minHeight: 120, justifyContent: 'center',
  },
  categoryCardSelected: { backgroundColor: COLORS.accent },
  categoryImage: {
    width: 64, height: 64, borderRadius: RADIUS.lg, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm,
  },
  categoryImageSelected: { backgroundColor: 'rgba(255,255,255,0.2)' },
  categoryName: { fontSize: FONTS.sizes.sm, color: COLORS.text, fontWeight: '600', textAlign: 'center' },
  categoryNameSelected: { color: COLORS.white },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  emptyText: { fontSize: FONTS.sizes.lg, fontWeight: '600', color: COLORS.text, marginTop: SPACING.md, textAlign: 'center' },
  emptySubText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.xs },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  modalBox: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: SPACING.xl, width: '90%', maxWidth: 400,
  },
  modalBoxCompact: {
    width: '94%',
    padding: SPACING.base,
  },
  modalTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.lg },
  modalInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2,
    fontSize: FONTS.sizes.base, color: COLORS.text, marginBottom: SPACING.lg,
  },
  modalBtns: { flexDirection: 'row', gap: SPACING.md },
  modalBtnsCompact: { flexDirection: 'column' },
  modalCancelBtn: {
    flex: 1, padding: SPACING.md, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
    minHeight: 44,
  },
  modalCancelText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '600' },
  modalSaveBtn: {
    flex: 1, padding: SPACING.md, borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent, alignItems: 'center',
    minHeight: 44,
  },
  modalSaveText: { color: COLORS.white, fontSize: FONTS.sizes.base, fontWeight: '600' },
});
