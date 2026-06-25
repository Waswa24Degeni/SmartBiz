import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Switch, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, RADIUS, COLORS } from '../../../lib/constants';

interface ExportReportModalProps {
  visible: boolean;
  onClose: () => void;
  exportFormat: 'pdf' | 'excel' | 'csv';
  setExportFormat: (fmt: 'pdf' | 'excel' | 'csv') => void;
  exportRange: 'today' | 'week' | 'month' | 'all';
  setExportRange: (range: 'today' | 'week' | 'month' | 'all') => void;
  includeLogo: boolean;
  setIncludeLogo: (value: boolean) => void;
  onExportConfirm: () => void;
  exporting: boolean;
}

export const ExportReportModal = ({
  visible,
  onClose,
  exportFormat,
  setExportFormat,
  exportRange,
  setExportRange,
  includeLogo,
  setIncludeLogo,
  onExportConfirm,
  exporting,
}: ExportReportModalProps) => {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.exportModalOverlay}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.exportModalContent}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Export Center</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
            {/* Export Format Selector */}
            <View style={styles.modalSection}>
              <Text style={styles.modalSectionLabel}>Export Format</Text>
              <View style={styles.modalGrid}>
                {[
                  { label: 'Export PDF', value: 'pdf', icon: 'document-text-outline' },
                  { label: 'Export Excel', value: 'excel', icon: 'grid-outline' },
                  { label: 'Export CSV', value: 'csv', icon: 'list-outline' },
                ].map((fmt) => (
                  <TouchableOpacity
                    key={fmt.value}
                    style={[styles.modalGridBtn, exportFormat === fmt.value && styles.modalGridBtnActive]}
                    onPress={() => setExportFormat(fmt.value as any)}
                  >
                    <Ionicons name={fmt.icon as any} size={14} color={exportFormat === fmt.value ? '#0165FC' : '#6B7280'} />
                    <Text style={[styles.modalGridText, exportFormat === fmt.value && styles.modalGridTextActive]}>{fmt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Export Date Range */}
            <View style={styles.modalSection}>
              <Text style={styles.modalSectionLabel}>Date Range</Text>
              <View style={styles.modalGrid}>
                {[
                  { label: 'Today', value: 'today' },
                  { label: 'This Week', value: 'week' },
                  { label: 'This Month', value: 'month' },
                  { label: 'Custom Range', value: 'all' },
                ].map((rangeOpt) => (
                  <TouchableOpacity
                    key={rangeOpt.value}
                    style={[styles.modalGridBtn, exportRange === rangeOpt.value && styles.modalGridBtnActive]}
                    onPress={() => setExportRange(rangeOpt.value as any)}
                  >
                    <Text style={[styles.modalGridText, exportRange === rangeOpt.value && styles.modalGridTextActive]}>{rangeOpt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Brand Logo Settings Toggle */}
            <View style={styles.modalSection}>
              <View style={styles.toggleSettingRow}>
                <View>
                  <Text style={styles.settingRowTitle}>Brand Logo</Text>
                  <Text style={styles.settingRowDesc}>Include company logo inside pdf header</Text>
                </View>
                <Switch
                  value={includeLogo}
                  onValueChange={setIncludeLogo}
                  trackColor={{ false: '#CBD5E1', true: '#0165FC' }}
                  thumbColor={Platform.OS === 'ios' ? undefined : '#FFFFFF'}
                />
              </View>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.modalResetBtn} onPress={onClose}>
              <Text style={styles.modalResetText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalApplyBtn, exporting && { opacity: 0.7 }]}
              onPress={onExportConfirm}
              disabled={exporting}
            >
              {exporting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.modalApplyText}>Generate & Download</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  exportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  exportModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xl,
    maxHeight: '90%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginVertical: SPACING.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  modalScroll: {
    marginTop: SPACING.md,
    maxHeight: 400,
  },
  modalSection: {
    marginBottom: SPACING.lg,
  },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  modalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalGridBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: RADIUS.md,
    minWidth: '29%',
  },
  modalGridBtnActive: {
    backgroundColor: '#0165FC10',
    borderColor: '#0165FC',
  },
  modalGridText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  modalGridTextActive: {
    color: '#0165FC',
    fontWeight: '700',
  },
  toggleSettingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  settingRowTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  settingRowDesc: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalResetBtn: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalResetText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  modalApplyBtn: {
    flex: 1.8,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0165FC',
    borderRadius: RADIUS.lg,
  },
  modalApplyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
