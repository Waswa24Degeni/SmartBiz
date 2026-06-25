import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS } from '../../../lib/constants';
import * as ImagePicker from 'expo-image-picker';

interface AddExpenseScreenProps {
  visible: boolean;
  onClose: () => void;
  categories: any[];
  onSave: (payload: any) => Promise<void>;
  currency: string;
  saving: boolean;
  onAddNewCategory: (name: string) => Promise<string | null>;
}

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', icon: 'cash-outline' },
  { id: 'mobile_money', label: 'Mobile Money', icon: 'phone-portrait-outline' },
] as const;

const STATUS_OPTIONS = [
  { id: 'paid', label: 'Paid', color: COLORS.success, icon: 'checkmark-circle-outline' },
  { id: 'pending', label: 'Pending', color: COLORS.warning, icon: 'time-outline' },
  { id: 'overdue', label: 'Overdue', color: COLORS.error, icon: 'alert-circle-outline' },
] as const;

export function AddExpenseScreen({
  visible,
  onClose,
  categories,
  onSave,
  currency,
  saving,
  onAddNewCategory,
}: AddExpenseScreenProps) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [supplier, setSupplier] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [status, setStatus] = useState<'paid' | 'pending' | 'overdue'>('paid');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [receiptImage, setReceiptImage] = useState<string | null>(null);

  const [newCatVisible, setNewCatVisible] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets?.length) {
      setReceiptImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    setCreatingCat(true);
    const newId = await onAddNewCategory(newCatName.trim());
    setCreatingCat(false);
    if (newId) {
      setSelectedCategory(newId);
      setNewCatVisible(false);
      setNewCatName('');
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !amount.trim() || !selectedCategory) {
      Alert.alert('Required Fields', 'Please fill all required fields (Category, Title, Amount).');
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0.');
      return;
    }

    // Embed status in description
    const finalDescription = `[STATUS:${status}] ${description.trim()}`;

    const payload = {
      title: title.trim(),
      amount: parsedAmount,
      description: finalDescription,
      category_id: selectedCategory,
      supplier: supplier.trim(),
      payment_method: paymentMethod,
      receipt_url: receiptImage,
    };

    await onSave(payload);
    handleClose();
  };

  const handleClose = () => {
    setTitle('');
    setAmount('');
    setDescription('');
    setSupplier('');
    setPaymentMethod('cash');
    setStatus('paid');
    setSelectedCategory('');
    setReceiptImage(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.card}>
          {/* Head */}
          <View style={styles.header}>
            <Text style={styles.title}>New Expense</Text>
            <TouchableOpacity onPress={handleClose} disabled={saving} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Form Scroll */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* Category Select */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Category *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catChipsScroll}>
                {categories.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.catChip, selectedCategory === c.id && styles.catChipActive]}
                    onPress={() => setSelectedCategory(c.id)}
                  >
                    <Text style={[styles.catChipText, selectedCategory === c.id && styles.catChipTextActive]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.catChipNew} onPress={() => setNewCatVisible(true)}>
                  <Ionicons name="add" size={14} color={COLORS.textSecondary} />
                  <Text style={styles.catChipNewText}>New Category</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

            {/* Title */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Title *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Office Stationery"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Amount */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Amount (${currency}) *</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Status Select */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Payment Status</Text>
              <View style={styles.pickerRow}>
                {STATUS_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.pickerChip,
                      status === opt.id && { backgroundColor: opt.color + '12', borderColor: opt.color },
                    ]}
                    onPress={() => setStatus(opt.id)}
                  >
                    <Ionicons name={opt.icon} size={16} color={status === opt.id ? opt.color : COLORS.textSecondary} />
                    <Text style={[styles.pickerChipText, status === opt.id && { color: opt.color, fontWeight: '700' }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Payment Method */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Payment Method</Text>
              <View style={styles.pickerRow}>
                {PAYMENT_METHODS.map((m) => (
                  <Pressable
                    key={m.id}
                    style={[styles.pickerChip, paymentMethod === m.id && styles.pickerChipActive]}
                    onPress={() => setPaymentMethod(m.id)}
                  >
                    <Ionicons
                      name={m.icon}
                      size={16}
                      color={paymentMethod === m.id ? COLORS.white : COLORS.textSecondary}
                    />
                    <Text style={[styles.pickerChipText, paymentMethod === m.id && styles.pickerChipTextActive]}>
                      {m.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Supplier */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Supplier / Vendor</Text>
              <TextInput
                style={styles.input}
                value={supplier}
                onChangeText={setSupplier}
                placeholder="e.g. Smart Supplies Ltd"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Description */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Description / Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe this expense transaction..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Receipt upload */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Receipt Image</Text>
              <TouchableOpacity style={styles.imagePicker} onPress={handlePickImage}>
                {receiptImage ? (
                  <View style={styles.previewContainer}>
                    <Image source={{ uri: receiptImage }} style={styles.imagePreview} />
                    <View style={styles.imageChangeBadge}>
                      <Ionicons name="camera" size={14} color={COLORS.white} />
                      <Text style={styles.imageChangeText}>Change</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.pickerPlaceholder}>
                    <Ionicons name="camera-outline" size={32} color={COLORS.textMuted} />
                    <Text style={styles.pickerPlaceholderText}>Tap to upload or take a photo of the receipt</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} disabled={saving}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSubmit} disabled={saving}>
              {saving ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Save Expense</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* New Category Modal */}
      <Modal visible={newCatVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.miniCard}>
            <Text style={styles.miniTitle}>New Category</Text>
            <TextInput
              style={styles.miniInput}
              placeholder="e.g. Travel"
              value={newCatName}
              onChangeText={setNewCatName}
              placeholderTextColor={COLORS.textMuted}
              autoFocus
            />
            <View style={styles.miniFooter}>
              <TouchableOpacity
                style={styles.miniCancel}
                onPress={() => {
                  setNewCatVisible(false);
                  setNewCatName('');
                }}
                disabled={creatingCat}
              >
                <Text style={styles.miniCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.miniSave} onPress={handleCreateCategory} disabled={creatingCat}>
                {creatingCat ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <Text style={styles.miniSaveText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    height: '92%',
    padding: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    paddingVertical: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  formGroup: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  catChipsScroll: {
    paddingRight: SPACING.lg,
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  catChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  catChipText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  catChipTextActive: {
    color: COLORS.white,
    fontWeight: '700',
  },
  catChipNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  catChipNewText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  pickerRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  pickerChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
  },
  pickerChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  pickerChipText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  pickerChipTextActive: {
    color: COLORS.white,
    fontWeight: '700',
  },
  imagePicker: {
    height: 140,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  previewContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imageChangeBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  imageChangeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
  },
  pickerPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
    gap: 8,
  },
  pickerPlaceholderText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
    fontWeight: '500',
    maxWidth: 240,
  },
  footer: {
    flexDirection: 'row',
    gap: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm + 2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontWeight: '700',
    fontSize: FONTS.sizes.sm,
  },
  saveBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm + 2,
    backgroundColor: COLORS.primary,
    borderRadius: 16,
  },
  saveBtnText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: FONTS.sizes.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  miniCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  miniTitle: {
    fontSize: FONTS.sizes.base,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  miniInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
  },
  miniFooter: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  miniCancel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
  },
  miniCancelText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
  miniSave: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
  },
  miniSaveText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
});
