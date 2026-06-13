import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS } from '../../../lib/constants';

interface Props {
  visible: boolean;
  onClose: () => void;
  onPrint: () => void;
  onExcel: () => void;
  onSharePdf: () => void;
  exporting: boolean;
}

const OPTIONS = [
  { key: 'print', label: 'Print Report', icon: 'print-outline', color: COLORS.primary },
  { key: 'excel', label: 'Export as CSV', icon: 'document-text-outline', color: COLORS.success },
  { key: 'share', label: 'Share PDF', icon: 'share-social-outline', color: COLORS.info },
] as const;

export const ExportSheet = React.memo(function ExportSheet({
  visible, onClose, onPrint, onExcel, onSharePdf, exporting,
}: Props) {
  const handlers: Record<string, () => void> = {
    print: onPrint,
    excel: onExcel,
    share: onSharePdf,
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>Export Report</Text>
          <View style={styles.options}>
            {OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.option, exporting && { opacity: 0.5 }]}
                onPress={() => { handlers[opt.key]?.(); onClose(); }}
                disabled={exporting}
                activeOpacity={0.7}
              >
                <View style={[styles.optionIcon, { backgroundColor: opt.color + '15' }]}>
                  <Ionicons name={opt.icon as any} size={22} color={opt.color} />
                </View>
                <Text style={styles.optionLabel}>{opt.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    paddingBottom: SPACING['2xl'],
    ...SHADOWS.lg,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  options: { gap: SPACING.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.base,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.lg,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    flex: 1,
    fontSize: FONTS.sizes.base,
    fontWeight: '600',
    color: COLORS.text,
  },
  cancelBtn: {
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelText: {
    fontSize: FONTS.sizes.base,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
});
