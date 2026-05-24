import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useSettings } from '../../context/SettingsContext';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../lib/hooks';
import { Product } from '../../types';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS, BREAKPOINTS } from '../../lib/constants';

type ProductWithCategory = Product & { category?: { name?: string } };
type CustomerLite = { id: string; full_name: string; phone?: string | null; email?: string | null };

export function POSScreen() {
  const { business, user } = useAuth();
  const { currency } = useSettings();
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;
  const isTablet = width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop;
  const isDesktop = width >= BREAKPOINTS.desktop;

  const {
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    subtotal,
    totalDiscount,
    total,
    itemCount,
  } = useCart();

  const [products, setProducts] = useState<ProductWithCategory[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [productView, setProductView] = useState<'cards' | 'compact'>('cards');
  const [processingSale, setProcessingSale] = useState(false);
  const [mobilePane, setMobilePane] = useState<'products' | 'cart'>('products');
  const [productsPaneWidth, setProductsPaneWidth] = useState(0);

  // ── Checkout modal ────────────────────────────────────────────
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [payMethod, setPayMethod] = useState<'cash' | 'mobile_money'>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [mobilePhone, setMobilePhone] = useState('');
  const [payerName, setPayerName] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const cashChange = useMemo(() => {
    const received = parseFloat(cashReceived) || 0;
    return Math.max(0, received - total);
  }, [cashReceived, total]);

  const openCheckout = () => {
    setCashReceived('');
    setMobilePhone('');
    setPayerName('');
    setPayMethod('cash');
    setCheckoutVisible(true);
  };

  const handleClearCart = () => {
    if (!items.length) return;
    Alert.alert('Clear cart', 'Remove all items from this cart?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => clearCart() },
    ]);
  };

  const persistSale = useCallback(async ({
    status,
    paymentStatus,
    paymentMethod,
    mobilePhone,
    payerName,
  }: {
    status: 'active' | 'completed';
    paymentStatus: 'pending' | 'paid';
    paymentMethod: 'cash' | 'mobile_money';
    mobilePhone?: string | null;
    payerName?: string | null;
  }) => {
    if (!business?.id || !user?.id) {
      throw new Error('Missing business or user context. Please sign in again.');
    }
    if (!items.length) {
      throw new Error('Add products before continuing.');
    }

    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        business_id: business.id,
        customer_id: selectedCustomerId,
        cashier_id: user.id,
        order_number: orderNumber,
        status,
        subtotal,
        discount: totalDiscount,
        total,
        payment_status: paymentStatus,
        payment_method: paymentMethod,
        mobile_phone: mobilePhone ?? null,
        payer_name: payerName ?? null,
      })
      .select('id')
      .single();

    if (saleError || !sale?.id) {
      throw new Error(saleError?.message || 'Unable to create sale record.');
    }

    const rows = items.map((i) => ({
      sale_id: sale.id,
      product_id: i.product.id,
      quantity: i.quantity,
      unit_price: i.product.selling_price,
      discount: i.discount * i.quantity,
      total: i.quantity * i.product.selling_price - i.discount * i.quantity,
    }));

    const { error: itemsError } = await supabase.from('sale_items').insert(rows);
    if (itemsError) {
      throw new Error(itemsError.message);
    }

    for (const item of items) {
      const newStock = Math.max(0, item.product.stock_quantity - item.quantity);
      const { error: stockError } = await supabase
        .from('products')
        .update({ stock_quantity: newStock })
        .eq('id', item.product.id);
      if (stockError) {
        throw new Error(stockError.message);
      }
    }

    return { orderNumber };
  }, [business?.id, user?.id, items, selectedCustomerId, subtotal, totalDiscount, total]);

  const handleHoldOrder = async () => {
    setProcessingSale(true);
    try {
      const { orderNumber } = await persistSale({
        status: 'active',
        paymentStatus: 'pending',
        paymentMethod: payMethod,
        mobilePhone: payMethod === 'mobile_money' ? mobilePhone.trim() || null : null,
        payerName: payMethod === 'mobile_money' ? payerName.trim() || null : null,
      });

      clearCart();
      setSelectedCustomerId(null);
      setCustomerSearch('');
      setCheckoutVisible(false);
      setCashReceived('');
      setMobilePhone('');
      setPayerName('');
      Alert.alert('Order saved', `Order ${orderNumber} is ready for later payment.`);
      fetchProducts();
    } catch (e: any) {
      Alert.alert('Save order error', e?.message ?? 'Could not save this order.');
    } finally {
      setProcessingSale(false);
    }
  };

  const fetchProducts = useCallback(async (silent = false) => {
    if (!business?.id) {
      if (!silent) setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*, category:categories(name)')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .gt('stock_quantity', 0)
      .order('name');

    if (error) {
      Alert.alert('Error', error.message);
      setProducts([]);
      setLoading(false);
      return;
    }

    setProducts((data as ProductWithCategory[]) ?? []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useRealtimeSubscription('pos-products-rt', 'products', () => fetchProducts(true), !!business?.id);

  const fetchCustomers = useCallback(async () => {
    if (!business?.id) {
      setCustomers([]);
      return;
    }

    const { data, error } = await supabase
      .from('customers')
      .select('id, full_name, phone, email')
      .eq('business_id', business.id)
      .order('full_name');

    if (error) {
      setCustomers([]);
      return;
    }

    setCustomers((data as CustomerLite[]) ?? []);
  }, [business?.id]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useRealtimeSubscription('pos-customers-rt', 'customers', () => fetchCustomers(), !!business?.id);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      const name = p.category?.name?.trim();
      if (name) set.add(name);
    });
    return ['All', ...Array.from(set)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchSearch = !q
        || p.name.toLowerCase().includes(q)
        || (p.description ?? '').toLowerCase().includes(q)
        || (p.barcode ?? '').toLowerCase().includes(q);

      const matchCategory = categoryFilter === 'All' || p.category?.name === categoryFilter;
      return matchSearch && matchCategory;
    });
  }, [products, search, categoryFilter]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => (
      c.full_name.toLowerCase().includes(q)
      || (c.phone ?? '').toLowerCase().includes(q)
      || (c.email ?? '').toLowerCase().includes(q)
    ));
  }, [customers, customerSearch]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const handleSelectCustomer = (customerId: string | null) => {
    setSelectedCustomerId(customerId);
    if (!customerId) return;
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return;
    if (customer.phone && !mobilePhone.trim()) setMobilePhone(customer.phone);
    if (!payerName.trim()) setPayerName(customer.full_name);
  };

  const handleCheckout = async () => {
    if (!business?.id || !user?.id) {
      Alert.alert('Unavailable', 'Missing business or user context. Please sign in again.');
      return;
    }
    if (!items.length) {
      Alert.alert('Cart empty', 'Add products before checkout.');
      return;
    }

    if (payMethod === 'cash') {
      const received = parseFloat(cashReceived) || 0;
      if (received < total) {
        Alert.alert('Insufficient amount', `Cash received (${currency} ${received.toLocaleString()}) is less than the total (${currency} ${total.toLocaleString()}).`);
        return;
      }
    }

    if (payMethod === 'mobile_money' && !mobilePhone.trim()) {
      Alert.alert('Phone required', "Please enter the customer's mobile money phone number.");
      return;
    }
    if (payMethod === 'mobile_money' && !payerName.trim()) {
      Alert.alert('Name required', "Please enter the payer's name.");
      return;
    }

    setProcessingSale(true);
    try {
      const { orderNumber } = await persistSale({
        status: payMethod === 'cash' ? 'completed' : 'active',
        paymentStatus: payMethod === 'cash' ? 'paid' : 'pending',
        paymentMethod: payMethod,
        mobilePhone: payMethod === 'mobile_money' ? mobilePhone.trim() || null : null,
        payerName: payMethod === 'mobile_money' ? payerName.trim() || null : null,
      });

      clearCart();
      setSelectedCustomerId(null);
      setCheckoutVisible(false);
      setCustomerSearch('');
      setCashReceived('');
      setMobilePhone('');
      setPayerName('');
      const change = payMethod === 'cash' ? cashChange : 0;
      Alert.alert(
        payMethod === 'cash' ? 'Payment Confirmed' : 'Payment Requested',
        payMethod === 'cash'
          ? `Sale ${orderNumber} recorded.\nChange: ${currency} ${change.toLocaleString()}`
          : `Sale ${orderNumber} recorded.\nMobile money request sent to ${mobilePhone.trim()}.`,
      );
      fetchProducts();
    } catch (e: any) {
      Alert.alert('Checkout error', e?.message ?? 'Could not complete checkout.');
    } finally {
      setProcessingSale(false);
    }
  };

  const summaryRows = [
    { label: 'Subtotal', value: subtotal, total: false },
    { label: 'Discount', value: totalDiscount, total: false },
    { label: 'Total', value: total, total: true },
  ];

  const renderCartItem = (item: (typeof items)[number]) => (
    <View key={item.product.id} style={styles.cartItemRow}>
      <View style={styles.cartItemDot}>
        <Text style={styles.cartItemDotText}>{item.product.name.charAt(0)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.cartItemName} numberOfLines={1}>{item.product.name}</Text>
        <Text style={styles.cartItemPrice}>{currency} {Number(item.product.selling_price).toLocaleString()}</Text>
      </View>
      <View style={styles.qtyControls}>
        <Pressable style={({ pressed }) => [styles.qtyBtn, pressed && styles.qtyBtnPressed]} onPress={() => updateQuantity(item.product.id, item.quantity - 1)}>
          <Ionicons name="remove" size={13} color={COLORS.text} />
        </Pressable>
        <Text style={styles.qtyVal}>{item.quantity}</Text>
        <Pressable style={({ pressed }) => [styles.qtyBtn, pressed && styles.qtyBtnPressed]} onPress={() => updateQuantity(item.product.id, item.quantity + 1)}>
          <Ionicons name="add" size={13} color={COLORS.text} />
        </Pressable>
        <Pressable style={styles.removeBtn} onPress={() => removeItem(item.product.id)}>
          <Ionicons name="trash-outline" size={14} color={COLORS.error} />
        </Pressable>
      </View>
    </View>
  );

  const showProductsPane = !isMobile || mobilePane === 'products';
  const showCartPane = !isMobile || mobilePane === 'cart';

  const numCols = isMobile ? 1 : 2;
  const cardWidth = productsPaneWidth > 0
    ? Math.floor((productsPaneWidth - SPACING.base * 2 - SPACING.sm * (numCols - 1)) / numCols)
    : undefined;

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }} />
        <Pressable style={styles.cartChip} onPress={() => isMobile && setMobilePane('cart')}>
          <LinearGradient
            colors={['#2C6E4F', '#1B3A2D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cartChipGradient}
          />
          <Ionicons name="cart-outline" size={14} color={COLORS.white} />
          <Text style={styles.cartChipText}>{itemCount} items</Text>
        </Pressable>
      </View>

      {isMobile && (
        <View style={styles.mobileSwitchRow}>
          <Pressable
            style={[styles.mobileSwitchBtn, mobilePane === 'products' && styles.mobileSwitchBtnActive]}
            onPress={() => setMobilePane('products')}
          >
            <Ionicons
              name="grid-outline"
              size={14}
              color={mobilePane === 'products' ? COLORS.white : COLORS.textSecondary}
            />
            <Text style={[styles.mobileSwitchText, mobilePane === 'products' && styles.mobileSwitchTextActive]}>
              Products
            </Text>
          </Pressable>

          <Pressable
            style={[styles.mobileSwitchBtn, mobilePane === 'cart' && styles.mobileSwitchBtnActive]}
            onPress={() => setMobilePane('cart')}
          >
            <Ionicons
              name="cart-outline"
              size={14}
              color={mobilePane === 'cart' ? COLORS.white : COLORS.textSecondary}
            />
            <Text style={[styles.mobileSwitchText, mobilePane === 'cart' && styles.mobileSwitchTextActive]}>
              Cart ({itemCount})
            </Text>
          </Pressable>
        </View>
      )}

      <View style={[styles.layout, isMobile && { flexDirection: 'column' }]}>
        {showProductsPane && (
          <View
            style={[styles.productsPane, isMobile && { width: '100%', borderRightWidth: 0 }]}
            onLayout={(e) => setProductsPaneWidth(e.nativeEvent.layout.width)}
          >
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={15} color={COLORS.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search products..."
              placeholderTextColor={COLORS.textMuted}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {isMobile ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryChips}>
              {categories.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.categoryChip, categoryFilter === c && styles.categoryChipActive]}
                  onPress={() => setCategoryFilter(c)}
                >
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.categoryChipText, categoryFilter === c && styles.categoryChipTextActive]}>
                    {c}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.categoryChipsWrap}>
              {categories.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.categoryChip, categoryFilter === c && styles.categoryChipActive]}
                  onPress={() => setCategoryFilter(c)}
                >
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.categoryChipText, categoryFilter === c && styles.categoryChipTextActive]}>
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.productViewSwitchRow}>
            <Pressable
              style={[styles.productViewSwitchBtn, productView === 'cards' && styles.productViewSwitchBtnActive]}
              onPress={() => setProductView('cards')}
            >
              <Ionicons name="grid-outline" size={14} color={productView === 'cards' ? COLORS.white : COLORS.textSecondary} />
              <Text style={[styles.productViewSwitchText, productView === 'cards' && styles.productViewSwitchTextActive]}>Cards</Text>
            </Pressable>
            <Pressable
              style={[styles.productViewSwitchBtn, productView === 'compact' && styles.productViewSwitchBtnActive]}
              onPress={() => setProductView('compact')}
            >
              <Ionicons name="list-outline" size={14} color={productView === 'compact' ? COLORS.white : COLORS.textSecondary} />
              <Text style={[styles.productViewSwitchText, productView === 'compact' && styles.productViewSwitchTextActive]}>Compact</Text>
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[
              styles.productsList,
              !isMobile && { flexDirection: 'row', flexWrap: 'wrap' },
            ]}>
              {filteredProducts.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="cube-outline" size={40} color={COLORS.textMuted} />
                  <Text style={styles.emptyText}>No matching products</Text>
                </View>
              ) : (
                filteredProducts.map((p) => {
                  const initial = p.name.charAt(0).toUpperCase();
                  const colorPalette = ['#1B3A2D', '#C49A2A', '#2563EB', '#059669', '#D97706', '#DC2626'];
                  const dotColor = colorPalette[p.name.charCodeAt(0) % colorPalette.length];
                  const lowStock = p.stock_quantity <= Math.max(1, p.low_stock_threshold ?? 0);

                  if (productView === 'compact') {
                    return (
                      <Pressable
                        key={p.id}
                        style={({ pressed }) => [
                          styles.compactProductRow,
                          pressed && styles.productCardPressed,
                        ]}
                        onPress={() => addItem(p)}
                      >
                        <View style={[styles.compactProductDot, { backgroundColor: dotColor + '18', borderColor: dotColor + '35' }]}>
                          <Text style={[styles.compactProductDotText, { color: dotColor }]}>{initial}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.compactProductName} numberOfLines={1}>{p.name}</Text>
                          <Text style={styles.compactProductMeta} numberOfLines={1}>{p.category?.name ?? 'General'}</Text>
                        </View>
                        <View style={styles.compactProductRight}>
                          <Text style={styles.compactProductPrice}>{currency} {Number(p.selling_price).toLocaleString()}</Text>
                          <Text style={[styles.compactProductStock, lowStock && styles.compactProductStockLow]}>
                            {p.stock_quantity} {p.unit}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  }

                  return (
                    <Pressable
                      key={p.id}
                      style={({ pressed }) => [
                        styles.productCard,
                        cardWidth ? { width: cardWidth } : { alignSelf: 'stretch' },
                        pressed && styles.productCardPressed,
                      ]}
                      onPress={() => addItem(p)}
                    >
                      <View style={styles.productMediaWrap}>
                        {p.image_url ? (
                          <Image source={{ uri: p.image_url }} style={styles.productImage} />
                        ) : (
                          <View style={[styles.productInitial, { backgroundColor: dotColor + '18', borderColor: dotColor + '30' }]}>
                            <Text style={[styles.productInitialText, { color: dotColor }]}>{initial}</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={2} ellipsizeMode="tail" style={styles.productName}>{p.name}</Text>
                        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.productMeta}>
                          {p.category?.name ?? 'General'}
                        </Text>
                        <View style={styles.productMetaRow}>
                          <View style={[styles.stockPill, lowStock && styles.stockPillLow]}>
                            <Ionicons
                              name={lowStock ? 'warning-outline' : 'checkmark-circle-outline'}
                              size={11}
                              color={lowStock ? COLORS.error : COLORS.success}
                            />
                            <Text style={[styles.stockPillText, lowStock && styles.stockPillTextLow]}>
                              {p.stock_quantity} {p.unit}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.productRight}>
                        <Text style={styles.productPrice}>{currency} {Number(p.selling_price).toLocaleString()}</Text>
                        <View style={styles.addBtn}>
                          <LinearGradient
                            colors={['#2C6E4F', '#1B3A2D']}
                            style={[StyleSheet.absoluteFill, { borderRadius: 10 }]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                          />
                          <Ionicons name="add" size={14} color={COLORS.white} />
                          <Text style={styles.addBtnText}>Add to Cart</Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          )}
          </View>
        )}

        {showCartPane && (
          <View
            style={[
              styles.cartPane,
              isTablet && { width: 320 },
              isDesktop && { width: 380 },
              isMobile && { width: '100%', borderTopWidth: 1, borderTopColor: COLORS.border },
            ]}
          >
          <Text style={styles.cartTitle}>Order Cart</Text>
          {items.length > 0 && (
            <Text style={styles.cartSubtitle}>{itemCount} item{itemCount !== 1 ? 's' : ''} selected</Text>
          )}

          <View style={styles.customerInlineBox}>
            <Text style={styles.customerInlineLabel}>Customer</Text>
            <View style={styles.customerInlineSearchRow}>
              <Ionicons name="search-outline" size={14} color={COLORS.textMuted} />
              <TextInput
                style={styles.customerInlineSearchInput}
                placeholder="Search customer by name, phone, or email"
                placeholderTextColor={COLORS.textMuted}
                value={customerSearch}
                onChangeText={setCustomerSearch}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.customerInlineChips}>
              <TouchableOpacity
                style={[styles.customerInlineChip, !selectedCustomerId && styles.customerInlineChipActive]}
                onPress={() => handleSelectCustomer(null)}
              >
                <Text style={[styles.customerInlineChipText, !selectedCustomerId && styles.customerInlineChipTextActive]}>Walk-in</Text>
              </TouchableOpacity>
              {filteredCustomers.slice(0, 10).map((customer) => (
                <TouchableOpacity
                  key={customer.id}
                  style={[styles.customerInlineChip, selectedCustomerId === customer.id && styles.customerInlineChipActive]}
                  onPress={() => handleSelectCustomer(customer.id)}
                >
                  <Text
                    style={[styles.customerInlineChipText, selectedCustomerId === customer.id && styles.customerInlineChipTextActive]}
                    numberOfLines={1}
                  >
                    {customer.full_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {selectedCustomer && (
              <Text style={styles.customerInlineSelected} numberOfLines={1}>
                Selected: {selectedCustomer.full_name}
              </Text>
            )}
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {items.length === 0 ? (
              <Text style={styles.emptyText}>No products added</Text>
            ) : (
              items.map(renderCartItem)
            )}
          </ScrollView>

          <View style={styles.summaryBox}>
            {summaryRows.map((row) => (
              <View key={row.label} style={[styles.summaryRow, row.total && styles.summaryRowTotal]}>
                <Text style={row.total ? styles.totalLabel : styles.summaryLabel}>{row.label}</Text>
                <Text style={row.total ? styles.totalVal : styles.summaryVal}>{currency} {row.value.toLocaleString()}</Text>
              </View>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.clearCartBtn,
              items.length === 0 && { opacity: 0.55 },
              pressed && items.length > 0 && styles.clearCartBtnPressed,
            ]}
            onPress={handleClearCart}
            disabled={items.length === 0}
          >
            <Ionicons name="trash-outline" size={15} color={COLORS.error} />
            <Text style={styles.clearCartText}>Clear Cart</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.addToOrderBtn,
              pressed && styles.addToOrderBtnPressed,
            ]}
            onPress={handleHoldOrder}
          >
            <Ionicons name="add-circle-outline" size={16} color={COLORS.primary} />
            <Text style={styles.addToOrderText}>Hold Order</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.checkoutBtn,
              (items.length === 0) && { opacity: 0.55 },
              pressed && { opacity: 0.85 },
            ]}
            onPress={openCheckout}
            disabled={items.length === 0}
          >
            <LinearGradient
              colors={['#34D399', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {processingSale ? (
              <ActivityIndicator color={COLORS.white} size="small" />
            ) : (
              <View style={styles.checkoutInner}>
                <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.white} />
                <Text style={styles.checkoutText}>Checkout · {currency} {total.toLocaleString()}</Text>
              </View>
            )}
          </Pressable>
          </View>
        )}
      </View>

      {/* ── Checkout Payment Modal ──────────────────────────── */}
      <Modal visible={checkoutVisible} transparent animationType="fade" onRequestClose={() => setCheckoutVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Confirm Payment</Text>
                <TouchableOpacity onPress={() => setCheckoutVisible(false)} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Total */}
              <View style={styles.checkoutAmountCard}>
                <Text style={styles.checkoutAmountLabel}>Total Due</Text>
                <Text style={styles.checkoutAmountValue}>{currency} {total.toLocaleString()}</Text>
              </View>

              {/* Method selector */}
              <Text style={styles.fieldLabel}>Customer (Optional)</Text>
              <View style={styles.customerBox}>
                <TextInput
                  style={styles.customerSearchInput}
                  placeholder="Search customer by name or phone"
                  placeholderTextColor={COLORS.textMuted}
                  value={customerSearch}
                  onChangeText={setCustomerSearch}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.customerChipsRow}>
                  <TouchableOpacity
                    style={[styles.customerChip, !selectedCustomerId && styles.customerChipActive]}
                    onPress={() => setSelectedCustomerId(null)}
                  >
                    <Text style={[styles.customerChipText, !selectedCustomerId && styles.customerChipTextActive]}>Walk-in</Text>
                  </TouchableOpacity>
                  {filteredCustomers.slice(0, 12).map((customer) => (
                    <TouchableOpacity
                      key={customer.id}
                      style={[styles.customerChip, selectedCustomerId === customer.id && styles.customerChipActive]}
                      onPress={() => handleSelectCustomer(customer.id)}
                    >
                      <Text style={[styles.customerChipText, selectedCustomerId === customer.id && styles.customerChipTextActive]} numberOfLines={1}>
                        {customer.full_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {selectedCustomer && (
                  <Text style={styles.customerSelectedText} numberOfLines={1}>
                    Selected: {selectedCustomer.full_name}
                  </Text>
                )}
              </View>

              {/* Method selector */}
              <Text style={styles.fieldLabel}>Payment Method</Text>
              <View style={styles.methodRow}>
                {([
                  { id: 'cash'         as const, label: 'Cash',         icon: 'cash-outline' },
                  { id: 'mobile_money' as const, label: 'Mobile Money', icon: 'phone-portrait-outline' },
                ] as const).map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.methodChip, payMethod === m.id && styles.methodChipActive]}
                    onPress={() => setPayMethod(m.id)}
                  >
                    <Ionicons name={m.icon as any} size={14} color={payMethod === m.id ? COLORS.white : COLORS.textSecondary} />
                    <Text style={[styles.methodChipText, payMethod === m.id && styles.methodChipTextActive]}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Cash fields */}
              {payMethod === 'cash' && (
                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Cash Received ({currency})</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder={String(total)}
                    placeholderTextColor={COLORS.textMuted}
                    value={cashReceived}
                    onChangeText={setCashReceived}
                    keyboardType="numeric"
                    autoFocus
                  />
                  {(parseFloat(cashReceived) || 0) >= total && (
                    <View style={styles.changeRow}>
                      <Ionicons name="return-down-forward-outline" size={14} color={COLORS.success} />
                      <Text style={styles.changeText}>Change: {currency} {cashChange.toLocaleString()}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Mobile money fields */}
              {payMethod === 'mobile_money' && (
                <>
                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>Payer Phone Number</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="0XXXXXXXXX or 255XXXXXXXXX"
                      placeholderTextColor={COLORS.textMuted}
                      value={mobilePhone}
                      onChangeText={setMobilePhone}
                      keyboardType="phone-pad"
                      autoFocus
                    />
                  </View>
                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>Payer Name</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="Full name of the account holder"
                      placeholderTextColor={COLORS.textMuted}
                      value={payerName}
                      onChangeText={setPayerName}
                      autoCapitalize="words"
                    />
                  </View>
                </>
              )}

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setCheckoutVisible(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalConfirmBtn, processingSale && { opacity: 0.7 }]}
                  onPress={handleCheckout}
                  disabled={processingSale}
                >
                  {processingSale ? (
                    <ActivityIndicator color={COLORS.white} size="small" />
                  ) : (
                    <Text style={styles.modalSaveText}>
                      {payMethod === 'cash' ? 'Confirm Payment' : 'Send Payment Request'}
                    </Text>
                  )}
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
  root: { flex: 1, backgroundColor: COLORS.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
    ...SHADOWS.xs,
  },
  title: { fontSize: FONTS.sizes.lg, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  subtitle: { marginTop: 2, fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  cartChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    overflow: 'hidden',
    position: 'relative',
    ...SHADOWS.sm,
  },
  cartChipGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  cartChipText: { color: COLORS.white, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  layout: { flex: 1, flexDirection: 'row' },
  productsPane: { flex: 1, minHeight: 0, borderRightWidth: 1, borderRightColor: COLORS.border },
  cartPane: { width: 360, minHeight: 0, padding: SPACING.base, backgroundColor: COLORS.surface, borderLeftWidth: 1, borderLeftColor: COLORS.border },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    margin: SPACING.base,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 1,
    ...SHADOWS.xs,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: FONTS.sizes.sm },
  categoryChips: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingBottom: SPACING.sm,
    gap: SPACING.xs,
  },
  categoryChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.base,
    paddingBottom: SPACING.sm,
    gap: SPACING.xs,
  },
  categoryChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    alignSelf: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
  },
  categoryChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  categoryChipText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  categoryChipTextActive: { color: COLORS.white },
  productViewSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.base,
    paddingBottom: SPACING.sm,
  },
  productViewSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    minHeight: 34,
  },
  productViewSwitchBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  productViewSwitchText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
  productViewSwitchTextActive: {
    color: COLORS.white,
  },
  productsList: { paddingHorizontal: SPACING.base, paddingBottom: SPACING['2xl'], gap: SPACING.sm },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.xs,
  } as any,
  productMediaWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    flexShrink: 0,
  },
  productImage: {
    width: '100%',
    height: '100%',
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
  },
  productName: { fontSize: FONTS.sizes.sm, color: COLORS.text, fontWeight: '700', letterSpacing: -0.1 },
  productMeta: { marginTop: 2, fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  productMetaRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.successLight,
  },
  stockPillLow: {
    backgroundColor: COLORS.errorLight,
  },
  stockPillText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.success,
    fontWeight: '700',
  },
  stockPillTextLow: {
    color: COLORS.error,
  },
  productPrice: { fontSize: FONTS.sizes.sm, color: COLORS.primary, fontWeight: '800' },
  addBtn: {
    minWidth: 110,
    height: 30,
    borderRadius: 10,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    overflow: 'hidden',
    position: 'relative',
    ...SHADOWS.sm,
  } as any,
  addBtnText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
  cartTitle: { fontSize: FONTS.sizes.base, fontWeight: '800', color: COLORS.text, letterSpacing: -0.2 },
  cartSubtitle: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  customerInlineBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  customerInlineLabel: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  customerInlineSearchRow: {
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
  customerInlineSearchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: FONTS.sizes.xs,
  },
  customerInlineChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingTop: SPACING.sm,
  },
  customerInlineChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    maxWidth: 160,
  },
  customerInlineChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  customerInlineChipText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
  },
  customerInlineChipTextActive: {
    color: COLORS.white,
  },
  customerInlineSelected: {
    marginTop: SPACING.xs,
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  cartItemName: { fontSize: FONTS.sizes.sm, color: COLORS.text, fontWeight: '600' },
  cartItemPrice: { marginTop: 2, fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  qtyBtn: {
    width: 24,
    height: 24,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceAlt,
  },
  qtyBtnPressed: {
    backgroundColor: COLORS.borderLight,
  },
  qtyVal: { minWidth: 18, textAlign: 'center', color: COLORS.text, fontWeight: '800', fontSize: FONTS.sizes.sm },
  removeBtn: { marginLeft: 2, padding: 3 },
  summaryBox: {
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surfaceAlt,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '500' },
  summaryVal: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  totalLabel: { color: COLORS.text, fontSize: FONTS.sizes.sm, fontWeight: '700' },
  totalVal: { color: COLORS.primary, fontSize: FONTS.sizes.md, fontWeight: '800' },
  clearCartBtn: {
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.errorLight,
    borderRadius: RADIUS.md,
    backgroundColor: '#FFF5F5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  clearCartBtnPressed: {
    backgroundColor: '#FDEDED',
  },
  clearCartText: {
    color: COLORS.error,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
  addToOrderBtn: {
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  addToOrderBtnPressed: {
    backgroundColor: COLORS.borderLight,
  },
  addToOrderText: {
    color: COLORS.primary,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
  checkoutBtn: {
    marginTop: SPACING.sm,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    overflow: 'hidden',
    position: 'relative',
    ...SHADOWS.md,
  } as any,
  checkoutText: { color: COLORS.white, fontSize: FONTS.sizes.base, fontWeight: '700', letterSpacing: 0.2 },
  emptyState: { alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.sm },
  emptyText: { color: COLORS.textMuted, textAlign: 'center', fontSize: FONTS.sizes.sm },
  mobileSwitchRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.base,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  mobileSwitchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
    paddingVertical: SPACING.sm,
  },
  mobileSwitchBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  mobileSwitchText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
  mobileSwitchTextActive: { color: COLORS.white },
  // Product card redesign
  productInitial: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  productInitialText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '800',
  },
  productRight: {
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  productCardPressed: {
    backgroundColor: COLORS.surfaceHover,
    transform: [{ scale: 0.98 }],
  },
  compactProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    minHeight: 52,
  },
  compactProductDot: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  compactProductDotText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '800',
  },
  compactProductName: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  compactProductMeta: {
    marginTop: 1,
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
  },
  compactProductRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  compactProductPrice: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '800',
    color: COLORS.primary,
  },
  compactProductStock: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.success,
  },
  compactProductStockLow: {
    color: COLORS.error,
  },
  // Cart item redesign
  cartItemDot: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary + '20',
    flexShrink: 0,
  },
  cartItemDotText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '800',
    color: COLORS.primary,
  },
  summaryRowTotal: {
    marginTop: SPACING.xs,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  checkoutInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  // ── Checkout modal ──────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.base,
  },
  modalBox: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    ...SHADOWS.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.base,
  },
  modalTitle: { fontSize: FONTS.sizes.lg, fontWeight: '800', color: COLORS.text },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceAlt,
  },
  checkoutAmountCard: {
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary + '12',
    padding: SPACING.base,
    alignItems: 'center',
    marginBottom: SPACING.base,
  },
  checkoutAmountLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: 4,
  },
  checkoutAmountValue: {
    fontSize: FONTS.sizes['2xl'],
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  fieldLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  customerBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  customerSearchInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 2,
    fontSize: FONTS.sizes.sm,
  },
  customerChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingTop: SPACING.sm,
  },
  customerChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    maxWidth: 180,
  },
  customerChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  customerChipText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
  },
  customerChipTextActive: {
    color: COLORS.white,
  },
  customerSelectedText: {
    marginTop: SPACING.xs,
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
  },
  methodRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  methodChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceAlt,
  },
  methodChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  methodChipText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  methodChipTextActive: { color: COLORS.white },
  fieldWrap: { marginBottom: SPACING.sm },
  fieldInput: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.base,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  changeText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.success,
  },
  modalBtns: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.base,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceAlt,
  },
  modalCancelText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  modalConfirmBtn: {
    flex: 2,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.success,
    ...SHADOWS.sm,
  },
  modalSaveText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '800',
    color: COLORS.white,
  },
});
