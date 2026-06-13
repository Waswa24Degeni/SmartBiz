import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { format } from 'date-fns';

import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { supabase } from '../../lib/supabase';
import {
  COLORS,
  SPACING,
  FONTS,
  RADIUS,
  BREAKPOINTS,
  WEB_OUTLINE_NONE,
} from '../../lib/constants';
import {
  createProformaInvoice,
  convertProformaToInvoice,
  markInvoicePaid,
  fetchInvoiceWithItems,
  searchInvoices,
  buildInvoiceHtml,
  getInvoiceStats,
  formatCurrency,
} from '../../lib/invoicing';
import { Invoice, InvoiceItem, Receipt } from '../../types';

const DOC_TYPE_COLORS: Record<string, string> = {
  proforma: COLORS.warning,
  invoice: COLORS.info,
  receipt: COLORS.success,
};

const DOC_TYPE_ICONS: Record<string, string> = {
  proforma: 'document-outline',
  invoice: 'receipt-outline',
  receipt: 'checkmark-done-circle-outline',
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  unpaid: COLORS.error,
  partial: COLORS.warning,
  paid: COLORS.success,
  overdue: COLORS.error,
};

export function InvoicesScreen() {
  const { user, business } = useAuth();
  const { currency } = useSettings();
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;
  const isTablet = width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop;
  const isDesktop = width >= BREAKPOINTS.desktop;
  const showSplit = !isMobile;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [search, setSearch] = useState('');
  const [filterDocType, setFilterDocType] = useState('All');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);

  const [markPaidVisible, setMarkPaidVisible] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [transactionRef, setTransactionRef] = useState('');

  const [stats, setStats] = useState({
    totalInvoices: 0,
    totalRevenue: 0,
    paidInvoices: 0,
    unpaidInvoices: 0,
  });

  useEffect(() => {
    if (business?.id) {
      fetchInvoices();
      fetchStats();
    }
  }, [business?.id]);

  const fetchInvoices = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      const filters: any = {};
      if (filterDocType !== 'All') filters.documentType = filterDocType;
      if (filterPaymentStatus !== 'All') filters.paymentStatus = filterPaymentStatus;

      const data = await searchInvoices(business!.id, search || undefined, filters);
      setInvoices(data || []);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await getInvoiceStats(business!.id);
      setStats(data);
    } catch (error: any) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesSearch =
        !search ||
        inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
        inv.customer_name.toLowerCase().includes(search.toLowerCase()) ||
        (inv.customer_phone?.toLowerCase().includes(search.toLowerCase()) ?? false);

      const matchesDocType = filterDocType === 'All' || inv.document_type === filterDocType;
      const matchesPaymentStatus =
        filterPaymentStatus === 'All' || inv.payment_status === filterPaymentStatus;

      return matchesSearch && matchesDocType && matchesPaymentStatus;
    });
  }, [invoices, search, filterDocType, filterPaymentStatus]);

  const handleSelectInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    if (isMobile) setDetailVisible(true);
  };

  const handleMarkPaid = async () => {
    if (!selectedInvoice || !amountPaid) {
      Alert.alert('Error', 'Please enter amount paid');
      return;
    }

    try {
      setExporting(true);
      await markInvoicePaid(
        selectedInvoice.id,
        paymentMethod,
        parseFloat(amountPaid),
        transactionRef || undefined
      );

      Alert.alert('Success', 'Invoice marked as paid and receipt generated');
      setMarkPaidVisible(false);
      setAmountPaid('');
      setTransactionRef('');
      setPaymentMethod('cash');
      fetchInvoices(true);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async (invoice: Invoice) => {
    try {
      setExporting(true);

      const invoiceData = await fetchInvoiceWithItems(invoice.id);
      const html = buildInvoiceHtml(
        {
          id: invoiceData.id,
          invoiceNumber: invoiceData.invoice_number,
          documentType: invoiceData.document_type,
          invoiceDate: invoiceData.invoice_date,
          dueDate: invoiceData.due_date,
          customerName: invoiceData.customer_name,
          customerPhone: invoiceData.customer_phone,
          businessName: invoiceData.business_name,
          items: invoiceData.invoice_items || [],
          subtotal: invoiceData.subtotal,
          customerEmail: invoiceData.customer_email,
          taxRate: invoiceData.tax_rate,
          taxAmount: invoiceData.tax_amount,
          discount: invoiceData.discount,
          grandTotal: invoiceData.grand_total,
          paymentStatus: invoiceData.payment_status,
          paymentMethod: invoiceData.payment_method,
          transactionReference: invoiceData.transaction_reference,
          amountPaid: invoiceData.amount_paid,
          balanceAmount: invoiceData.balance_amount,
          termsConditions: invoiceData.terms_conditions,
          notes: invoiceData.notes,
        },
        currency
      );

      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
      } else {
        const printed = await Print.printToFileAsync({ html });
        if (printed.uri) {
          await Sharing.shareAsync(printed.uri);
        }
      }

      setExporting(false);
      Alert.alert('Success', 'Document exported successfully');
    } catch (error: any) {
      setExporting(false);
      Alert.alert('Error', error.message);
    }
  };

  const handleConvertToInvoice = async () => {
    if (!selectedInvoice) return;

    Alert.alert(
      'Convert to Invoice',
      'Convert this proforma to an official invoice?',
      [
        {
          text: 'Cancel',
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: 'Convert',
          onPress: async () => {
            try {
              setExporting(true);
              await convertProformaToInvoice(selectedInvoice.id, 30);
              Alert.alert('Success', 'Proforma converted to invoice');
              fetchInvoices(true);
              setExporting(false);
            } catch (error: any) {
              Alert.alert('Error', error.message);
              setExporting(false);
            }
          },
        },
      ]
    );
  };

  const docTypeBadge = (docType: string) => (
    <View style={[styles.badge, { backgroundColor: DOC_TYPE_COLORS[docType] + '22' }]}>
      <Ionicons
        name={DOC_TYPE_ICONS[docType] as any}
        size={11}
        color={DOC_TYPE_COLORS[docType]}
        style={{ marginRight: 3 }}
      />
      <Text style={[styles.badgeText, { color: DOC_TYPE_COLORS[docType] }]}>
        {docType.charAt(0).toUpperCase() + docType.slice(1)}
      </Text>
    </View>
  );

  const paymentBadge = (status: string) => (
    <View style={[styles.badge, { backgroundColor: PAYMENT_STATUS_COLORS[status] + '22' }]}>
      <Ionicons
        name={
          status === 'paid'
            ? 'checkmark-circle-outline'
            : status === 'partial'
              ? 'ellipsis-horizontal-outline'
              : 'alert-circle-outline'
        }
        color={PAYMENT_STATUS_COLORS[status]}
        size={11}
        style={{ marginRight: 3 }}
      />
      <Text style={[styles.badgeText, { color: PAYMENT_STATUS_COLORS[status] }]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );

  const DetailContent = ({ invoice }: { invoice: Invoice }) => {
    const isPaid = invoice.payment_status === 'paid';
    const isProforma = invoice.document_type === 'proforma';

    return (
      <>
        <View style={styles.detailHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.detailTitle}>{invoice.invoice_number}</Text>
            <Text style={styles.detailMeta}>
              {format(new Date(invoice.invoice_date), 'dd MMM yyyy, HH:mm')}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.closeBtn]}
            onPress={() => {
              setSelectedInvoice(null);
              setDetailVisible(false);
            }}
          >
            <Ionicons name="close" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.detailContent}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Document Info</Text>
            <View style={styles.infoGrid}>
              {[
                { label: 'Number', value: invoice.invoice_number },
                { label: 'Type', value: invoice.document_type.toUpperCase() },
                { label: 'Status', value: invoice.payment_status },
                {
                  label: 'Date',
                  value: format(new Date(invoice.invoice_date), 'dd MMM yyyy'),
                },
              ].map((item) => (
                <View key={item.label} style={styles.infoCell}>
                  <Text style={styles.infoCellLabel}>{item.label}</Text>
                  <Text style={styles.infoCellValue}>{item.value}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Customer</Text>
            <View style={styles.customerCard}>
              <Text style={styles.customerName}>{invoice.customer_name}</Text>
              {!!invoice.customer_phone && (
                <Text style={styles.customerMeta}>📱 {invoice.customer_phone}</Text>
              )}
              {!!invoice.customer_email && (
                <Text style={styles.customerMeta}>✉️ {invoice.customer_email}</Text>
              )}
            </View>
          </View>

          {invoice.invoice_items && invoice.invoice_items.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Items</Text>
              <View style={styles.itemsHeader}>
                <Text style={[styles.itemsHeadText, { flex: 1 }]}>Item</Text>
                <Text style={styles.itemsHeadText}>Qty</Text>
                <Text style={[styles.itemsHeadText, { textAlign: 'right' }]}>Total</Text>
              </View>
              {invoice.invoice_items.map((item: InvoiceItem) => (
                <View key={item.id} style={styles.itemRow}>
                  <Text style={[styles.itemName, { flex: 1 }]}>{item.description}</Text>
                  <Text style={styles.itemQty}>{Number(item.quantity).toFixed(2)}</Text>
                  <Text style={styles.itemTotal}>
                    {formatCurrency(item.item_total, currency)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.totalsCard}>
              <View style={styles.totalLine}>
                <Text style={styles.totalLineLabel}>Subtotal</Text>
                <Text style={styles.totalLineValue}>
                  {formatCurrency(invoice.subtotal, currency)}
                </Text>
              </View>
              {invoice.tax_rate > 0 && (
                <View style={styles.totalLine}>
                  <Text style={styles.totalLineLabel}>Tax ({invoice.tax_rate}%)</Text>
                  <Text style={styles.totalLineValue}>
                    {formatCurrency(invoice.tax_amount, currency)}
                  </Text>
                </View>
              )}
              {invoice.discount > 0 && (
                <View style={styles.totalLine}>
                  <Text style={[styles.totalLineLabel, { color: COLORS.success }]}>
                    Discount
                  </Text>
                  <Text style={[styles.totalLineValue, { color: COLORS.success }]}>
                    −{formatCurrency(invoice.discount, currency)}
                  </Text>
                </View>
              )}
              <View style={[styles.totalLine, styles.totalFinalLine]}>
                <Text style={styles.totalFinalLabel}>Grand Total</Text>
                <Text style={styles.totalFinalValue}>
                  {formatCurrency(invoice.grand_total, currency)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.actionBtns}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.exportBtn]}
              onPress={() => handleExportPdf(invoice)}
              disabled={exporting}
            >
              <Ionicons name="download-outline" size={16} color={COLORS.white} />
              <Text style={styles.exportBtnText}>Export PDF</Text>
            </TouchableOpacity>

            {isProforma && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.convertBtn]}
                onPress={handleConvertToInvoice}
                disabled={exporting}
              >
                <Ionicons name="swap-horizontal-outline" size={16} color={COLORS.white} />
                <Text style={styles.convertBtnText}>Convert to Invoice</Text>
              </TouchableOpacity>
            )}

            {!isPaid && invoice.document_type === 'invoice' && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.payBtn]}
                onPress={() => setMarkPaidVisible(true)}
                disabled={exporting}
              >
                <Ionicons name="checkmark-done-outline" size={16} color={COLORS.white} />
                <Text style={styles.payBtnText}>Mark as Paid</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </>
    );
  };

  return (
    <View style={styles.container}>
      {/* Stats Strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.statsStrip}
        contentContainerStyle={styles.statsStripContent}
      >
        {[
          { icon: 'document-outline', label: 'Total', value: String(stats.totalInvoices) },
          { icon: 'checkmark-circle-outline', label: 'Paid', value: String(stats.paidInvoices) },
          {
            icon: 'alert-circle-outline',
            label: 'Unpaid',
            value: String(stats.unpaidInvoices),
          },
          {
            icon: 'cash-outline',
            label: 'Revenue',
            value: formatCurrency(stats.totalRevenue, currency),
          },
        ].map((stat) => (
          <View key={stat.label} style={styles.statChip}>
            <View style={styles.statChipIcon}>
              <Ionicons name={stat.icon as any} size={14} color={COLORS.accent} />
            </View>
            <Text style={styles.statChipValue}>{stat.value}</Text>
            <Text style={styles.statChipLabel}>{stat.label}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.layout}>
        {/* List View */}
        <View style={[styles.listCol, isMobile && styles.fullWidth]}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Invoices & Receipts</Text>
          </View>

          {/* Filters */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterStrip}
            contentContainerStyle={styles.filterContent}
          >
            {['All', 'proforma', 'invoice', 'receipt'].map((type) => (
              <TouchableOpacity
                key={`dt-${type}`}
                style={[
                  styles.filterPill,
                  filterDocType === type && styles.filterPillActive,
                ]}
                onPress={() => {
                  setFilterDocType(type);
                }}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    filterDocType === type && styles.filterPillTextActive,
                  ]}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterStrip}
            contentContainerStyle={styles.filterContent}
          >
            {['All', 'unpaid', 'partial', 'paid', 'overdue'].map((status) => (
              <TouchableOpacity
                key={`ps-${status}`}
                style={[
                  styles.filterPill,
                  filterPaymentStatus === status && styles.filterPillActive,
                ]}
                onPress={() => {
                  setFilterPaymentStatus(status);
                }}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    filterPaymentStatus === status && styles.filterPillTextActive,
                  ]}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Search */}
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={14} color={COLORS.textMuted} />
            <TextInput
              style={[styles.searchInput, WEB_OUTLINE_NONE]}
              placeholder="Invoice #, customer name..."
              value={search}
              onChangeText={setSearch}
              placeholderTextColor={COLORS.textMuted}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={14} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* List */}
          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>
                {search ? 'No matching invoices' : 'No invoices yet'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              style={styles.invoicesList}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: SPACING.xl, paddingTop: SPACING.xs }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    fetchInvoices(true);
                  }}
                  tintColor={COLORS.accent}
                />
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.invoiceCard,
                    showSplit && selectedInvoice?.id === item.id && styles.invoiceCardSelected,
                  ]}
                  onPress={() => handleSelectInvoice(item)}
                  activeOpacity={0.78}
                >
                  <View
                    style={[
                      styles.invoiceAccentBar,
                      { backgroundColor: DOC_TYPE_COLORS[item.document_type] },
                    ]}
                  />
                  <View style={styles.invoiceCardInner}>
                    <View style={styles.invoiceCardTop}>
                      <Text style={styles.invoiceNum}>{item.invoice_number}</Text>
                      {docTypeBadge(item.document_type)}
                    </View>
                    <View style={styles.invoiceCardMid}>
                      <Text style={styles.invoiceCustomer}>{item.customer_name}</Text>
                      {!!item.customer_phone && (
                        <Text style={styles.invoiceMeta}>📱 {item.customer_phone}</Text>
                      )}
                      <Text style={styles.invoiceMeta}>
                        {format(new Date(item.invoice_date), 'dd MMM yyyy')}
                      </Text>
                    </View>
                    <View style={styles.invoiceCardBottom}>
                      {paymentBadge(item.payment_status)}
                      <Text style={styles.invoiceTotal}>
                        {formatCurrency(item.grand_total, currency)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
            />
          )}
        </View>

        {/* Detail View */}
        {showSplit && selectedInvoice && (
          <ScrollView style={styles.detailCol} contentContainerStyle={styles.detailColContent}>
            <DetailContent invoice={selectedInvoice} />
          </ScrollView>
        )}

        {showSplit && !selectedInvoice && (
          <View style={styles.detailEmpty}>
            <Ionicons name="document-outline" size={36} color={COLORS.textMuted} />
            <Text style={styles.detailEmptyTitle}>No invoice selected</Text>
            <Text style={styles.detailEmptyText}>Tap an invoice to view details</Text>
          </View>
        )}
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      )}

      {/* Mark Paid Modal */}
      <Modal visible={markPaidVisible} transparent animationType="slide" onRequestClose={() => setMarkPaidVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mark as Paid</Text>
              <TouchableOpacity onPress={() => setMarkPaidVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Amount Paid</Text>
                <TextInput
                  style={[styles.modalInput, WEB_OUTLINE_NONE]}
                  placeholder="0.00"
                  value={amountPaid}
                  onChangeText={setAmountPaid}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Payment Method</Text>
                <View style={styles.radioGroup}>
                  {['cash', 'mobile_money', 'bank_card', 'cheque'].map((method) => (
                    <TouchableOpacity
                      key={method}
                      style={styles.radioOption}
                      onPress={() => setPaymentMethod(method)}
                    >
                      <View
                        style={[
                          styles.radio,
                          paymentMethod === method && styles.radioSelected,
                        ]}
                      >
                        {paymentMethod === method && <View style={styles.radioDot} />}
                      </View>
                      <Text style={styles.radioLabel}>
                        {method.replace('_', ' ').toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Transaction Reference (Optional)</Text>
                <TextInput
                  style={[styles.modalInput, WEB_OUTLINE_NONE]}
                  placeholder="Reference number..."
                  value={transactionRef}
                  onChangeText={setTransactionRef}
                />
              </View>

              <TouchableOpacity
                style={[styles.confirmBtn, exporting && { opacity: 0.6 }]}
                onPress={handleMarkPaid}
                disabled={exporting}
              >
                {exporting ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <Ionicons name="checkmark-done-outline" size={18} color={COLORS.white} />
                    <Text style={styles.confirmBtnText}>Mark as Paid</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Detail Modal (Mobile) */}
      <Modal visible={detailVisible && isMobile} transparent animationType="slide" onRequestClose={() => setDetailVisible(false)}>
        <View style={styles.fullModal}>
          {selectedInvoice && <DetailContent invoice={selectedInvoice} />}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    zIndex: 20,
    elevation: 20,
  },

  statsStrip: { maxHeight: 100 },
  statsStripContent: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.sm },
  statChip: {
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    minWidth: 80,
  },
  statChipIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accent + '22',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  statChipValue: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text },
  statChipLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },

  layout: { flex: 1, flexDirection: 'row' },
  listCol: { flex: 1, borderRightWidth: 1, borderRightColor: COLORS.border },
  fullWidth: { flex: 1 },
  detailCol: { flex: 1, overflow: 'hidden' },
  detailColContent: { padding: SPACING.lg, paddingBottom: SPACING['3xl'] },
  detailEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailEmptyTitle: { marginTop: SPACING.md, fontSize: FONTS.sizes.base, fontWeight: '600' },
  detailEmptyText: {
    marginTop: SPACING.xs,
    fontSize: FONTS.sizes.sm,
    color: COLORS.textMuted,
  },

  listHeader: { padding: SPACING.md, paddingBottom: SPACING.sm },
  listTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },

  filterStrip: { maxHeight: 50 },
  filterContent: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, gap: SPACING.sm },
  filterPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterPillActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterPillText: { fontSize: FONTS.sizes.xs, fontWeight: '600', color: COLORS.textMuted },
  filterPillTextActive: { color: COLORS.white },

  searchBar: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text },

  invoicesList: { flex: 1, paddingHorizontal: SPACING.md },
  invoiceCard: {
    flexDirection: 'row',
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  invoiceCardSelected: { borderColor: COLORS.accent, borderWidth: 2 },
  invoiceAccentBar: { width: 4 },
  invoiceCardInner: { flex: 1, padding: SPACING.sm, gap: 4 },
  invoiceCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  invoiceNum: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text },
  invoiceCardMid: { gap: 2 },
  invoiceCustomer: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text },
  invoiceMeta: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  invoiceCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  invoiceTotal: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: { fontSize: 10, fontWeight: '600' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 100 },
  emptyText: { marginTop: SPACING.md, fontSize: FONTS.sizes.base, color: COLORS.textMuted },

  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  detailTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  detailMeta: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted, marginTop: SPACING.xs },
  closeBtn: { padding: SPACING.sm },

  detailContent: { flex: 1 },
  section: { marginBottom: SPACING.lg, paddingBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sectionTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },

  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  infoCell: { flex: 0.5, minWidth: 150 },
  infoCellLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginBottom: SPACING.xs },
  infoCellValue: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text },

  customerCard: { padding: SPACING.md, backgroundColor: COLORS.background, borderRadius: RADIUS.md },
  customerName: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  customerMeta: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted, marginTop: SPACING.xs },

  itemsHeader: {
    flexDirection: 'row',
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  itemsHeadText: { fontSize: FONTS.sizes.xs, fontWeight: '600', color: COLORS.textMuted },
  itemRow: {
    flexDirection: 'row',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  itemName: { fontSize: FONTS.sizes.sm, color: COLORS.text },
  itemQty: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted, minWidth: 40, textAlign: 'center' },
  itemTotal: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text, minWidth: 80, textAlign: 'right' },

  totalsCard: { padding: SPACING.md, backgroundColor: COLORS.background, borderRadius: RADIUS.md, gap: SPACING.sm },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
  },
  totalLineLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted },
  totalLineValue: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text },
  totalFinalLine: {
    paddingTop: SPACING.sm,
    borderTopWidth: 2,
    borderTopColor: COLORS.border,
  },
  totalFinalLabel: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  totalFinalValue: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.accent },

  actionBtns: { gap: SPACING.md, marginTop: SPACING.lg },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  exportBtn: { backgroundColor: COLORS.accent },
  exportBtnText: { color: COLORS.white, fontWeight: '600' },
  convertBtn: { backgroundColor: COLORS.warning },
  convertBtnText: { color: COLORS.white, fontWeight: '600' },
  payBtn: { backgroundColor: COLORS.success },
  payBtnText: { color: COLORS.white, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    maxHeight: '80%',
  },
  fullModal: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  modalContent: { padding: SPACING.lg, gap: SPACING.lg },
  modalSection: { gap: SPACING.sm },
  modalLabel: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
  },
  radioGroup: { gap: SPACING.sm },
  radioOption: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: COLORS.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent },
  radioLabel: { fontSize: FONTS.sizes.sm, color: COLORS.text },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.success,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  confirmBtnText: { color: COLORS.white, fontWeight: '700', fontSize: FONTS.sizes.base },
});
