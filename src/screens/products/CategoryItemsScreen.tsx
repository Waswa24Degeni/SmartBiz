import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, Alert,
  Modal, TextInput, ActivityIndicator, useWindowDimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Product, Category } from '../../types';
import { useCart } from '../../context/CartContext';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS, BREAKPOINTS } from '../../lib/constants';
import { useRealtimeSubscription } from '../../lib/hooks';
import { getPosLabel, getPosType, parseSpreadsheet } from '../../lib/inventory';

interface ProductForm {
  name: string;
  description: string;
  selling_price: string;
  purchase_price: string;
  stock_quantity: string;
  unit: string;
}

const EMPTY_FORM: ProductForm = {
  name: '', description: '', selling_price: '', purchase_price: '', stock_quantity: '', unit: 'piece',
};

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface Props {
  category?: Category | null;
  onBack?: () => void;
}

export function CategoryItemsScreen({ category = null, onBack }: Props) {
  const { business } = useAuth();
  const { addItem, items } = useCart();
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'category' | 'all'>(category?.id ? 'category' : 'all');
  const [importing, setImporting] = useState(false);

  // Detail modal on mobile
  const [detailVisible, setDetailVisible] = useState(false);

  // CRUD modal
  const [crudVisible, setCrudVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const posType = getPosType(business?.category);
  const posLabel = getPosLabel(posType);

  const fetchProducts = useCallback(async (silent = false) => {
    if (!business?.id) { if (!silent) setLoading(false); return; }
    if (!silent) setLoading(true);
    let query = supabase
      .from('products')
      .select('*')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .order('name');

    if (mode === 'category' && category?.id) {
      query = query.eq('category_id', category.id);
    }

    const { data } = await query;
    const list = (data as Product[]) ?? [];
    setProducts(list);
    if (list.length && !selectedProduct) setSelectedProduct(list[0]);
    if (!list.length) setSelectedProduct(null);
    setLoading(false);
  }, [business?.id, category?.id, mode]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  useEffect(() => {
    if (!category?.id && mode === 'category') {
      setMode('all');
    }
  }, [category?.id, mode]);

  useRealtimeSubscription('products-rt', 'products', () => fetchProducts(true), !!business?.id);

  const openAdd = () => {
    setEditingProduct(null);
    setForm(EMPTY_FORM);
    setCrudVisible(true);
  };

  const handleImportProducts = async () => {
    if (!business?.id) return;

    const picked = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (picked.canceled || !picked.assets?.length) return;

    const file = picked.assets[0];
    const fileName = file.name || file.uri.split('/').pop() || 'import.xlsx';
    const lowerName = fileName.toLowerCase();
    const isCsv = lowerName.endsWith('.csv');

    try {
      setImporting(true);
      let content: string | ArrayBuffer;

      if (Platform.OS === 'web') {
        const response = await fetch(file.uri);
        if (!response.ok) {
          throw new Error('Unable to read the selected file.');
        }
        content = isCsv ? await response.text() : await response.arrayBuffer();
      } else {
        content = await FileSystem.readAsStringAsync(file.uri, {
          encoding: isCsv ? FileSystem.EncodingType.UTF8 : FileSystem.EncodingType.Base64,
        });
      }

      const parsedRows = parseSpreadsheet(content, fileName, isCsv);
      if (!parsedRows.length) {
        Alert.alert('No data', 'No valid product rows found. Ensure sheet has a "name" column.');
        setImporting(false);
        return;
      }

      const { data: existingCategories } = await supabase
        .from('categories')
        .select('id, name')
        .eq('business_id', business.id);

      const categoryMap = new Map<string, string>();
      ((existingCategories as Category[]) ?? []).forEach((c) => {
        categoryMap.set(c.name.toLowerCase(), c.id);
      });

      const missingCategoryNames = Array.from(
        new Set(
          parsedRows
            .map((r) => (r.categoryName || '').trim())
            .filter(Boolean)
            .filter((name) => !categoryMap.has(name.toLowerCase())),
        ),
      );

      if (missingCategoryNames.length) {
        const { data: insertedCats, error: catErr } = await supabase
          .from('categories')
          .insert(missingCategoryNames.map((name) => ({ business_id: business.id, name })))
          .select('id, name');

        if (catErr) {
          Alert.alert('Import error', catErr.message);
          setImporting(false);
          return;
        }

        ((insertedCats as Category[]) ?? []).forEach((c) => categoryMap.set(c.name.toLowerCase(), c.id));
      }

      const { data: existingProducts } = await supabase
        .from('products')
        .select('id, name, category_id')
        .eq('business_id', business.id);

      const productMap = new Map<string, { id: string }>();
      ((existingProducts as Product[]) ?? []).forEach((p) => {
        const key = `${p.name.toLowerCase()}::${p.category_id ?? ''}`;
        productMap.set(key, { id: p.id });
      });

      let created = 0;
      let updated = 0;

      for (const row of parsedRows) {
        const rowCategoryId =
          (row.categoryName && categoryMap.get(row.categoryName.toLowerCase()))
          || (mode === 'category' && category?.id ? category.id : null);
        const key = `${row.name.toLowerCase()}::${rowCategoryId ?? ''}`;
        const existing = productMap.get(key);

        const payload = {
          business_id: business.id,
          category_id: rowCategoryId,
          name: row.name,
          description: row.description ?? null,
          selling_price: row.sellingPrice,
          purchase_price: row.purchasePrice,
          stock_quantity: row.stockQuantity,
          unit: row.unit,
          barcode: row.barcode ?? null,
          is_active: row.isActive,
        };

        if (existing) {
          const { error } = await supabase.from('products').update(payload).eq('id', existing.id);
          if (!error) updated += 1;
          continue;
        }

        const { error } = await supabase.from('products').insert(payload);
        if (!error) created += 1;
      }

      Alert.alert('Import complete', `Created: ${created}\nUpdated: ${updated}`);
      fetchProducts();
    } catch (e: any) {
      Alert.alert('Import error', e?.message ?? 'Unable to process spreadsheet.');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    const sampleData = posType === 'pharmacy'
      ? [
          {
            name: 'Paracetamol 500mg',
            category: 'OTC Medicine',
            description: 'Pain relief tablets',
            selling_price: 1200,
            purchase_price: 800,
            stock_quantity: 100,
            unit: 'box',
            barcode: 'PHA-001',
            is_active: true,
          },
          {
            name: 'Vitamin C 1000mg',
            category: 'Vitamins',
            description: 'Immune support supplement',
            selling_price: 18000,
            purchase_price: 12000,
            stock_quantity: 60,
            unit: 'bottle',
            barcode: 'PHA-002',
            is_active: true,
          },
        ]
      : posType === 'electronics'
        ? [
            {
              name: 'USB-C Charger 20W',
              category: 'Accessories',
              description: 'Fast charging adapter',
              selling_price: 35000,
              purchase_price: 22000,
              stock_quantity: 45,
              unit: 'piece',
              barcode: 'ELE-001',
              is_active: true,
            },
            {
              name: 'Bluetooth Earbuds',
              category: 'Audio',
              description: 'Wireless stereo earbuds',
              selling_price: 65000,
              purchase_price: 42000,
              stock_quantity: 30,
              unit: 'piece',
              barcode: 'ELE-002',
              is_active: true,
            },
          ]
        : [
            {
              name: 'Chicken Pilau',
              category: 'Main Dishes',
              description: 'Served with kachumbari',
              selling_price: 15000,
              purchase_price: 9000,
              stock_quantity: 25,
              unit: 'plate',
              barcode: 'FOOD-001',
              is_active: true,
            },
            {
              name: 'Mango Juice',
              category: 'Beverages',
              description: 'Fresh mango drink',
              selling_price: 4000,
              purchase_price: 2200,
              stock_quantity: 80,
              unit: 'bottle',
              barcode: 'FOOD-002',
              is_active: true,
            },
          ];

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(sampleData);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Products');
    const base64Xlsx = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

    try {
      if (Platform.OS === 'web') {
        const g = globalThis as any;
        const anchor = g.document.createElement('a');
        anchor.href = `data:${XLSX_MIME};base64,${base64Xlsx}`;
        anchor.download = 'inventory_import_template.xlsx';
        g.document.body.appendChild(anchor);
        anchor.click();
        g.document.body.removeChild(anchor);
        return;
      }

      if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
        const perms = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (perms.granted) {
          const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            perms.directoryUri,
            'inventory_import_template.xlsx',
            XLSX_MIME,
          );
          await FileSystem.writeAsStringAsync(fileUri, base64Xlsx, {
            encoding: FileSystem.EncodingType.Base64,
          });
          Alert.alert('Template saved', 'XLSX template saved to selected folder.');
          return;
        }
      }

      const fileUri = `${FileSystem.documentDirectory}inventory_import_template.xlsx`;
      await FileSystem.writeAsStringAsync(fileUri, base64Xlsx, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: XLSX_MIME,
          dialogTitle: 'Download Inventory Template',
          UTI: 'org.openxmlformats.spreadsheetml.sheet',
        });
      } else {
        Alert.alert('Template saved', `Template saved to: ${fileUri}`);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Unable to create template file.');
    }
  };

  const openEdit = (p: Product) => {
    setEditingProduct(p);
    setForm({
      name: p.name,
      description: p.description ?? '',
      selling_price: String(p.selling_price),
      purchase_price: String(p.purchase_price),
      stock_quantity: String(p.stock_quantity),
      unit: p.unit,
    });
    setCrudVisible(true);
  };

  const handleDelete = (p: Product) => {
    Alert.alert(
      'Delete Product',
      `Delete "${p.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('products')
              .update({ is_active: false })
              .eq('id', p.id);
            if (error) Alert.alert('Error', error.message);
            else {
              if (selectedProduct?.id === p.id) setSelectedProduct(null);
              fetchProducts();
            }
          },
        },
      ],
    );
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Required', 'Product name is required');
      return;
    }
    if (!business?.id) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      selling_price: parseFloat(form.selling_price) || 0,
      purchase_price: parseFloat(form.purchase_price) || 0,
      stock_quantity: parseInt(form.stock_quantity) || 0,
      unit: form.unit.trim() || 'piece',
    };
    if (editingProduct) {
      const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id);
      if (error) Alert.alert('Error', error.message);
    } else {
      const { error } = await supabase.from('products').insert({
        ...payload,
        business_id: business.id,
        category_id: mode === 'category' && category?.id ? category.id : null,
        is_active: true,
      });
      if (error) Alert.alert('Error', error.message);
    }
    setSaving(false);
    setCrudVisible(false);
    fetchProducts();
  };

  const handleSelectProduct = (p: Product) => {
    setSelectedProduct(p);
    if (isMobile) setDetailVisible(true);
  };

  const handleAddToOrder = (p: Product) => {
    addItem(p);
    Alert.alert('Added', `${p.name} added to order`);
  };

  const cartItem = (p: Product) => items.find(i => i.product.id === p.id);

  const filteredProducts = products.filter((p) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q)
      || (p.description ?? '').toLowerCase().includes(q)
      || (p.barcode ?? '').toLowerCase().includes(q);
  });

  const productIcon = posType === 'pharmacy'
    ? 'medkit-outline'
    : posType === 'electronics'
      ? 'hardware-chip-outline'
      : 'fast-food-outline';

  // Detail panel content
  const renderDetail = (p: Product) => (
    <>
      <View style={styles.detailImageWrap}>
        <Ionicons name="fast-food-outline" size={80} color={COLORS.accent} />
      </View>
      <Text style={styles.detailName}>{p.name}</Text>
      <Text style={styles.detailWeight}>{p.description ?? ''}</Text>
      <Text style={styles.detailPrice}>TZS {p.selling_price.toLocaleString()}</Text>
      <View style={styles.detailMeta}>
        <View style={styles.detailMetaItem}>
          <Text style={styles.detailMetaLabel}>Stock</Text>
          <Text style={[styles.detailMetaValue, p.stock_quantity <= p.low_stock_threshold && { color: COLORS.warning }]}>
            {p.stock_quantity} {p.unit}
          </Text>
        </View>
        <View style={styles.detailMetaItem}>
          <Text style={styles.detailMetaLabel}>Unit</Text>
          <Text style={styles.detailMetaValue}>{p.unit}</Text>
        </View>
      </View>
      <View style={styles.detailActions}>
        <TouchableOpacity style={styles.detailEditBtn} onPress={() => { setDetailVisible(false); openEdit(p); }}>
          <Ionicons name="pencil-outline" size={16} color={COLORS.primary} />
          <Text style={styles.detailEditText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addToOrderBtn}
          onPress={() => handleAddToOrder(p)}
          activeOpacity={0.85}
        >
          <Text style={styles.addToOrderText}>Add to Order</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <View style={styles.layout}>
        {/* Products grid */}
        <View style={styles.gridWrap}>
          <View style={styles.gridHeader}>
            <View style={{ flex: 1, marginRight: SPACING.sm }}>
              <Text style={styles.gridTitle}>{mode === 'all' ? 'All Products' : (category?.name ?? 'Category')}</Text>
              <Text style={styles.gridSubTitle}>{posLabel}</Text>
            </View>
            <View style={styles.headerActions}>
              {!!category?.id && (
                <TouchableOpacity
                  style={[styles.modeBtn, mode === 'category' && styles.modeBtnActive]}
                  onPress={() => setMode('category')}
                >
                  <Text style={[styles.modeBtnText, mode === 'category' && styles.modeBtnTextActive]}>Category</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'all' && styles.modeBtnActive]}
                onPress={() => setMode('all')}
              >
                <Text style={[styles.modeBtnText, mode === 'all' && styles.modeBtnTextActive]}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.importBtn, importing && { opacity: 0.65 }]}
                onPress={handleImportProducts}
                disabled={importing}
              >
                {importing ? <ActivityIndicator color={COLORS.primary} size="small" /> : <Ionicons name="cloud-upload-outline" size={16} color={COLORS.primary} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.templateBtn}
                onPress={handleDownloadTemplate}
              >
                <Ionicons name="download-outline" size={16} color={COLORS.info} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
                <Ionicons name="add" size={18} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={15} color={COLORS.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search products, description or barcode..."
              placeholderTextColor={COLORS.textMuted}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {loading ? (
            <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />
          ) : filteredProducts.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name={productIcon as any} size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>{mode === 'category' ? 'No products in this category' : 'No products yet'}</Text>
              <TouchableOpacity style={styles.emptyAddBtn} onPress={openAdd}>
                <Text style={styles.emptyAddText}>Add Product</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filteredProducts}
              keyExtractor={item => item.id}
              numColumns={isMobile ? 2 : 3}
              key={isMobile ? 'mobile' : 'desktop'}
              contentContainerStyle={styles.grid}
              renderItem={({ item }) => {
                const ct = cartItem(item);
                return (
                  <TouchableOpacity
                    style={[
                      styles.productCard,
                      !isMobile && selectedProduct?.id === item.id && styles.productCardSelected,
                    ]}
                    onPress={() => handleSelectProduct(item)}
                    onLongPress={() =>
                      Alert.alert(item.name, 'Choose an action', [
                        { text: 'Edit', onPress: () => openEdit(item) },
                        { text: 'Delete', style: 'destructive', onPress: () => handleDelete(item) },
                        { text: 'Cancel', style: 'cancel' },
                      ])
                    }
                    activeOpacity={0.85}
                  >
                    <View style={styles.productImageWrap}>
                      <Ionicons
                        name={productIcon as any}
                        size={32}
                        color={!isMobile && selectedProduct?.id === item.id ? COLORS.white : COLORS.accent}
                      />
                    </View>
                    <Text style={[styles.productName, !isMobile && selectedProduct?.id === item.id && styles.productNameSelected]}>
                      {item.name}
                    </Text>
                    <Text style={[styles.productWeight, !isMobile && selectedProduct?.id === item.id && styles.productWeightSelected]}>
                      {item.description ?? ''}
                    </Text>
                    <Text style={[styles.productPrice, !isMobile && selectedProduct?.id === item.id && styles.productPriceSelected]}>
                      TZS {item.selling_price.toLocaleString()}
                    </Text>
                    {ct && ct.quantity > 0 && (
                      <View style={styles.cartBadge}>
                        <Text style={styles.cartBadgeText}>{ct.quantity}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>

        {/* Desktop detail panel */}
        {!isMobile && selectedProduct && (
          <ScrollView style={styles.detailPanel}>
            {renderDetail(selectedProduct)}
          </ScrollView>
        )}
      </View>

      {/* Mobile detail modal */}
      <Modal visible={isMobile && detailVisible} transparent animationType="slide">
        <View style={styles.mobileDetailOverlay}>
          <View style={styles.mobileDetailSheet}>
            <TouchableOpacity style={styles.mobileSheetClose} onPress={() => setDetailVisible(false)}>
              <Ionicons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
            {selectedProduct && <ScrollView>{renderDetail(selectedProduct)}</ScrollView>}
          </View>
        </View>
      </Modal>

      {/* Add / Edit product modal */}
      <Modal visible={crudVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>{editingProduct ? 'Edit Product' : 'New Product'}</Text>
              <ScrollView>
                {[
                  { label: 'Name *',        key: 'name',           keyboard: 'default' },
                  { label: 'Description',   key: 'description',    keyboard: 'default' },
                  { label: 'Selling Price', key: 'selling_price',  keyboard: 'decimal-pad' },
                  { label: 'Buy Price',     key: 'purchase_price', keyboard: 'decimal-pad' },
                  { label: 'Stock Qty',     key: 'stock_quantity', keyboard: 'number-pad' },
                  { label: 'Unit',          key: 'unit',           keyboard: 'default' },
                ].map(f => (
                  <View key={f.key} style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>{f.label}</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={form[f.key as keyof ProductForm]}
                      onChangeText={v => setForm(prev => ({ ...prev, [f.key]: v }))}
                      keyboardType={f.keyboard as any}
                      placeholderTextColor={COLORS.textMuted}
                      placeholder={f.label.replace(' *', '')}
                    />
                  </View>
                ))}
              </ScrollView>
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setCrudVisible(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveBtn, saving && { opacity: 0.7 }]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color={COLORS.white} size="small" />
                    : <Text style={styles.modalSaveText}>{editingProduct ? 'Save' : 'Create'}</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  layout: { flex: 1, flexDirection: 'row' },
  gridWrap: { flex: 1 },
  gridHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: SPACING.md,
  },
  gridTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  gridSubTitle: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  modeBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
  },
  modeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  modeBtnText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontWeight: '600' },
  modeBtnTextActive: { color: COLORS.white },
  importBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  templateBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.info,
    backgroundColor: COLORS.surface,
  },
  addBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center',
  },
  searchWrap: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  searchInput: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text },
  grid: { padding: SPACING.md },
  productCard: {
    flex: 1, margin: SPACING.sm, backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg, padding: SPACING.md, alignItems: 'center',
    ...SHADOWS.sm, position: 'relative',
  },
  productCardSelected: { backgroundColor: COLORS.accent },
  productImageWrap: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xs,
  },
  productName: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  productNameSelected: { color: COLORS.white },
  productWeight: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginBottom: SPACING.xs },
  productWeightSelected: { color: 'rgba(255,255,255,0.7)' },
  productPrice: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.accent },
  productPriceSelected: { color: COLORS.white },
  cartBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: COLORS.primary, borderRadius: 10,
    width: 18, height: 18, alignItems: 'center', justifyContent: 'center',
  },
  cartBadgeText: { color: COLORS.white, fontSize: 10, fontWeight: 'bold' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  emptyText: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, marginTop: SPACING.md, textAlign: 'center' },
  emptyAddBtn: { marginTop: SPACING.md, backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  emptyAddText: { color: COLORS.white, fontWeight: '600' },
  // Desktop detail panel
  detailPanel: {
    width: 260, backgroundColor: COLORS.surface,
    padding: SPACING.base, borderLeftWidth: 1, borderLeftColor: COLORS.border,
  },
  // Mobile detail bottom sheet
  mobileDetailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  mobileDetailSheet: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    padding: SPACING.xl, maxHeight: '85%',
  },
  mobileSheetClose: { alignSelf: 'flex-end', padding: SPACING.xs, marginBottom: SPACING.sm },
  // Shared detail content
  detailImageWrap: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.background,
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md,
  },
  detailName: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  detailWeight: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, textAlign: 'center' },
  detailPrice: { fontSize: FONTS.sizes['2xl'], fontWeight: '800', color: COLORS.accent, textAlign: 'center', marginVertical: SPACING.sm },
  detailMeta: { flexDirection: 'row', justifyContent: 'center', gap: SPACING.xl, marginBottom: SPACING.md },
  detailMetaItem: { alignItems: 'center' },
  detailMetaLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  detailMetaValue: { fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.text },
  detailActions: { gap: SPACING.sm, marginTop: SPACING.sm },
  detailEditBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
    borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: SPACING.sm,
  },
  detailEditText: { color: COLORS.primary, fontWeight: '600', fontSize: FONTS.sizes.sm },
  addToOrderBtn: {
    backgroundColor: COLORS.accent, borderRadius: RADIUS.md,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  addToOrderText: { color: COLORS.white, fontSize: FONTS.sizes.base, fontWeight: '700' },
  // CRUD modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  modalBox: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl,
    width: '90%', maxWidth: 480, maxHeight: '85%',
  },
  modalTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },
  fieldWrap: { marginBottom: SPACING.md },
  fieldLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginBottom: SPACING.xs },
  fieldInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.base, color: COLORS.text,
  },
  modalBtns: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.md },
  modalCancelBtn: {
    flex: 1, padding: SPACING.md, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  modalCancelText: { color: COLORS.textSecondary, fontWeight: '600' },
  modalSaveBtn: { flex: 1, padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.accent, alignItems: 'center' },
  modalSaveText: { color: COLORS.white, fontWeight: '600' },
});

