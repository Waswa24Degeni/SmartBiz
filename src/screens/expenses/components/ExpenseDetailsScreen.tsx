import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS } from '../../../lib/constants';
import { format } from 'date-fns';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

interface ExpenseDetailsScreenProps {
  visible: boolean;
  onClose: () => void;
  expense: any;
  currency: string;
  onEdit: (expense: any) => void;
  onDelete: (expense: any) => void;
}

const PAYMENT_METHODS_LABELS: Record<string, string> = {
  cash: 'Cash',
  mobile_money: 'Mobile Money',
};

export function ExpenseDetailsScreen({
  visible,
  onClose,
  expense,
  currency,
  onEdit,
  onDelete,
}: ExpenseDetailsScreenProps) {
  if (!expense) return null;

  // Extract status and description from virtual status
  const descriptionRaw = expense.description || '';
  const statusMatch = descriptionRaw.match(/^\[STATUS:(\w+)\]\s*/);
  const status = statusMatch ? statusMatch[1] : 'paid';
  const notes = statusMatch ? descriptionRaw.replace(/^\[STATUS:\w+\]\s*/, '') : descriptionRaw;

  const handleDownloadReceipt = async () => {
    if (!expense.receipt_url) {
      Alert.alert('No Receipt', 'There is no receipt attached to this expense.');
      return;
    }

    try {
      const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!baseDir) throw new Error('Cannot access storage.');

      const isBase64 = expense.receipt_url.startsWith('data:image');
      const ext = isBase64 ? 'jpg' : expense.receipt_url.split('.').pop() || 'jpg';
      const dest = `${baseDir}receipt_${expense.id}.${ext}`;

      if (isBase64) {
        const base64Data = expense.receipt_url.split(',')[1];
        await FileSystem.writeAsStringAsync(dest, base64Data, { encoding: FileSystem.EncodingType.Base64 });
      } else {
        // Assume remote URL
        const downloadRes = await FileSystem.downloadAsync(expense.receipt_url, dest);
        if (downloadRes.status !== 200) throw new Error('Download failed');
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dest, { mimeType: 'image/jpeg', dialogTitle: 'Receipt Attachment' });
      } else {
        Alert.alert('Success', `Receipt saved to: ${dest}`);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to download receipt');
    }
  };

  const getStatusLabel = () => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getStatusColor = () => {
    switch (status) {
      case 'paid':
        return COLORS.success;
      case 'pending':
        return COLORS.warning;
      case 'overdue':
        return COLORS.error;
      default:
        return COLORS.success;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerSubtitle}>Expense Information</Text>
              <Text style={styles.headerTitle}>{expense.title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Details Scroll */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* Amount display */}
            <View style={styles.amountContainer}>
              <Text style={styles.amountLabel}>Total Amount</Text>
              <Text style={styles.amountText}>{currency} {Number(expense.amount).toLocaleString()}</Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + '12', borderColor: getStatusColor() }]}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
                <Text style={[styles.statusLabelText, { color: getStatusColor() }]}>{getStatusLabel()}</Text>
              </View>
            </View>

            {/* Info list */}
            <View style={styles.infoList}>
              <View style={styles.infoRow}>
                <View style={styles.infoMeta}>
                  <Ionicons name="cube-outline" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.infoLabel}>Category</Text>
                </View>
                <Text style={styles.infoValue}>{expense.category?.name || 'Uncategorized'}</Text>
              </View>

              <View style={styles.infoRow}>
                <View style={styles.infoMeta}>
                  <Ionicons name="card-outline" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.infoLabel}>Payment Method</Text>
                </View>
                <Text style={styles.infoValue}>{PAYMENT_METHODS_LABELS[expense.payment_method] || 'Cash'}</Text>
              </View>

              {expense.supplier ? (
                <View style={styles.infoRow}>
                  <View style={styles.infoMeta}>
                    <Ionicons name="storefront-outline" size={16} color={COLORS.textSecondary} />
                    <Text style={styles.infoLabel}>Supplier / Vendor</Text>
                  </View>
                  <Text style={styles.infoValue}>{expense.supplier}</Text>
                </View>
              ) : null}

              <View style={styles.infoRow}>
                <View style={styles.infoMeta}>
                  <Ionicons name="person-outline" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.infoLabel}>Created By</Text>
                </View>
                <Text style={styles.infoValue}>{expense.creator?.full_name || 'Staff'}</Text>
              </View>

              <View style={styles.infoRow}>
                <View style={styles.infoMeta}>
                  <Ionicons name="calendar-outline" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.infoLabel}>Created Date</Text>
                </View>
                <Text style={styles.infoValue}>{format(new Date(expense.expense_date), 'dd MMM yyyy')}</Text>
              </View>

              {notes ? (
                <View style={[styles.infoRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 6 }]}>
                  <View style={styles.infoMeta}>
                    <Ionicons name="document-text-outline" size={16} color={COLORS.textSecondary} />
                    <Text style={styles.infoLabel}>Notes</Text>
                  </View>
                  <Text style={styles.notesText}>{notes}</Text>
                </View>
              ) : null}
            </View>

            {/* Attachment preview */}
            <View style={styles.attachmentWrap}>
              <Text style={styles.attachmentTitle}>Attachment (Receipt)</Text>
              {expense.receipt_url ? (
                <View style={styles.receiptFrame}>
                  <Image source={{ uri: expense.receipt_url }} style={styles.receiptImage} resizeMode="contain" />
                </View>
              ) : (
                <View style={styles.noReceiptFrame}>
                  <Ionicons name="image-outline" size={32} color={COLORS.textMuted} />
                  <Text style={styles.noReceiptText}>No receipt image attached</Text>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <View style={styles.mainActions}>
              <TouchableOpacity style={styles.editBtn} onPress={() => onEdit(expense)}>
                <Ionicons name="create-outline" size={18} color={COLORS.primary} />
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(expense)}>
                <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>

            {expense.receipt_url ? (
              <TouchableOpacity style={styles.downloadBtn} onPress={handleDownloadReceipt}>
                <Ionicons name="cloud-download-outline" size={18} color={COLORS.white} />
                <Text style={styles.downloadBtnText}>Download Receipt</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    padding: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.md,
    marginBottom: SPACING.md,
  },
  headerSubtitle: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 2,
  },
  closeBtn: {
    padding: SPACING.xs,
  },
  scroll: {
    paddingBottom: SPACING.xl,
  },
  amountContainer: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
    ...SHADOWS.xs,
  },
  amountLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  amountText: {
    fontSize: FONTS.sizes['2xl'],
    fontWeight: '800',
    color: COLORS.text,
    marginVertical: SPACING.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    marginTop: SPACING.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabelText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
  infoList: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.xs,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  infoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
    fontWeight: '700',
  },
  notesText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginTop: SPACING.xs,
  },
  attachmentWrap: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...SHADOWS.xs,
  },
  attachmentTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  receiptFrame: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  receiptImage: {
    width: '100%',
    height: '100%',
  },
  noReceiptFrame: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: COLORS.surfaceAlt,
    gap: 8,
  },
  noReceiptText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  footer: {
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.sm,
  },
  mainActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.sm + 2,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
  },
  editBtnText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: FONTS.sizes.sm,
  },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.sm + 2,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
  },
  deleteBtnText: {
    color: COLORS.error,
    fontWeight: '700',
    fontSize: FONTS.sizes.sm,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.sm + 2,
    backgroundColor: COLORS.primary,
    borderRadius: 16,
  },
  downloadBtnText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: FONTS.sizes.sm,
  },
});
