import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS } from '../../../lib/constants';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { format } from 'date-fns';

interface ExportExpenseModalProps {
  visible: boolean;
  onClose: () => void;
  reportType: 'summary' | 'category' | 'monthly' | 'budget';
  expenses: any[];
  categories: any[];
  currency: string;
  businessName: string;
  businessLogoUrl?: string;
  budget: number;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/"/g, '""');
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str}"`;
  }
  return str;
}

export function ExportExpenseModal({
  visible,
  onClose,
  reportType,
  expenses,
  categories,
  currency,
  businessName,
  businessLogoUrl,
  budget,
}: ExportExpenseModalProps) {
  const [formatType, setFormatType] = useState<'pdf' | 'excel'>('pdf');
  const [includeLogo, setIncludeLogo] = useState(true);
  const [exporting, setExporting] = useState(false);

  const getReportName = () => {
    switch (reportType) {
      case 'summary':
        return 'Expense Summary Report';
      case 'category':
        return 'Category Expense Report';
      case 'monthly':
        return 'Monthly Expense Report';
      case 'budget':
        return 'Budget Report';
    }
  };

  const getReportFileName = (ext: string) => {
    // Current date representation (e.g. June_2026)
    const dateStr = format(new Date(), 'MMMM_yyyy');
    return `Expense_Report_${dateStr}.${ext}`;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      if (formatType === 'pdf') {
        await generatePDF();
      } else {
        await generateExcel();
      }
    } catch (error: any) {
      Alert.alert('Export Failed', error?.message || 'Something went wrong.');
    } finally {
      setExporting(false);
    }
  };

  const generatePDF = async () => {
    // 1. Calculations
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const utilization = budget > 0 ? (totalExpenses / budget) * 100 : 0;

    // Category Breakdown
    const catMap: Record<string, number> = {};
    expenses.forEach((e) => {
      const name = e.category?.name || 'Uncategorized';
      catMap[name] = (catMap[name] || 0) + Number(e.amount);
    });
    const categoryRows = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, val]) => `
        <div class="breakdown-item">
          <span>${escapeHtml(name)}</span>
          <span style="font-weight: 700;">${currency} ${val.toLocaleString()} (${totalExpenses > 0 ? ((val / totalExpenses) * 100).toFixed(0) : 0}%)</span>
        </div>
      `).join('');

    // Table rows
    const tableRows = expenses.map((e) => `
      <tr>
        <td>${format(new Date(e.expense_date), 'dd MMM yyyy')}</td>
        <td>${escapeHtml(e.title)}</td>
        <td>${escapeHtml(e.category?.name || 'Uncategorized')}</td>
        <td style="text-align: right; font-weight: 700;">${currency} ${Number(e.amount).toLocaleString()}</td>
        <td>${escapeHtml(e.creator?.full_name || 'Staff')}</td>
      </tr>
    `).join('');

    const logoHtml = includeLogo && businessLogoUrl
      ? `<img class="logo" src="${businessLogoUrl}" alt="Business Logo" />`
      : `<div class="logo-placeholder">${escapeHtml(businessName.slice(0, 2).toUpperCase())}</div>`;

    const html = `
      <html>
        <head>
          <meta charset="utf-8"/>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; padding: 32px; background: #FFFFFF; line-height: 1.5; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #E5E7EB; padding-bottom: 20px; margin-bottom: 24px; }
            .logo { max-height: 50px; max-width: 150px; object-fit: contain; }
            .logo-placeholder { width: 44px; height: 44px; border-radius: 8px; background: #0165FC; color: #FFFFFF; font-weight: 800; font-size: 18px; display: flex; align-items: center; justify-content: center; }
            .title-section h1 { font-size: 22px; font-weight: 800; color: #111827; margin: 0; }
            .title-section p { font-size: 13px; color: #6B7280; margin: 4px 0 0 0; }
            .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px; }
            .summary-card { background: #F8FAFC; padding: 16px; border-radius: 12px; border: 1px solid #E5E7EB; }
            .summary-card h3 { font-size: 11px; font-weight: 700; color: #6B7280; text-transform: uppercase; margin: 0 0 6px 0; letter-spacing: 0.5px; }
            .summary-card p { font-size: 18px; font-weight: 800; color: #0165FC; margin: 0; }
            .breakdown-section { margin-bottom: 28px; }
            .breakdown-section h2 { font-size: 15px; font-weight: 700; margin: 0 0 12px 0; border-bottom: 1px solid #E5E7EB; padding-bottom: 6px; }
            .breakdown-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
            .breakdown-item { display: flex; justify-content: space-between; font-size: 12px; padding: 6px 0; border-bottom: 1px dashed #F1F5F9; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 11px; }
            th { background: #F8FAFC; font-weight: 700; text-align: left; border-bottom: 2px solid #E5E7EB; padding: 10px; color: #111827; }
            td { border-bottom: 1px solid #E5E7EB; padding: 10px; color: #374151; }
            tr:nth-child(even) td { background: #FAFAFA; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title-section">
              <h1>${escapeHtml(getReportName())}</h1>
              <p>Business Name: ${escapeHtml(businessName)}</p>
              <p>Period: ${format(new Date(), 'MMMM yyyy')} • Generated: ${format(new Date(), 'PPpp')}</p>
            </div>
            ${logoHtml}
          </div>

          <div class="summary-grid">
            <div class="summary-card">
              <h3>Total Expenses</h3>
              <p>${currency} ${totalExpenses.toLocaleString()}</p>
            </div>
            <div class="summary-card">
              <h3>Monthly Budget</h3>
              <p>${currency} ${budget.toLocaleString()}</p>
            </div>
            <div class="summary-card">
              <h3>Budget Utilization</h3>
              <p>${utilization.toFixed(1)}%</p>
            </div>
          </div>

          <div class="breakdown-section">
            <h2>Category Breakdown</h2>
            <div class="breakdown-grid">
              ${categoryRows || '<p style="color: #6B7280; font-size: 12px;">No expenses recorded.</p>'}
            </div>
          </div>

          <h2 style="font-size: 15px; font-weight: 700; margin: 24px 0 8px 0; border-bottom: 1px solid #E5E7EB; padding-bottom: 6px;">Expense Transactions Ledger</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Expense Name</th>
                <th>Category</th>
                <th style="text-align: right;">Amount</th>
                <th>Created By</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows || '<tr><td colspan="5" style="text-align: center; color: #6B7280;">No expenses found</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `;

    if (Platform.OS === 'web') {
      await Print.printAsync({ html });
      onClose();
      return;
    }

    const printed = await Print.printToFileAsync({ html });
    const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
    if (!baseDir) throw new Error('Cannot access local file storage.');

    const fileName = getReportFileName('pdf');
    const dest = `${baseDir}${fileName}`;
    await FileSystem.copyAsync({ from: printed.uri, to: dest });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(dest, { mimeType: 'application/pdf', dialogTitle: 'Download PDF', UTI: 'com.adobe.pdf' });
    } else {
      Alert.alert('Saved', `PDF saved to: ${dest}`);
    }
    onClose();
  };

  const generateExcel = async () => {
    const header = ['Expense Name', 'Category', 'Amount', 'Date', 'Created By', 'Payment Method'];
    const rows = expenses.map((e) => [
      escapeCsv(e.title),
      escapeCsv(e.category?.name || 'Uncategorized'),
      escapeCsv(e.amount),
      escapeCsv(format(new Date(e.expense_date), 'yyyy-MM-dd')),
      escapeCsv(e.creator?.full_name || 'Staff'),
      escapeCsv(e.payment_method || 'cash'),
    ].join(','));

    const csvContent = [header.join(','), ...rows].join('\n');
    const fileName = getReportFileName('xlsx');

    if (Platform.OS === 'web') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      onClose();
      return;
    }

    const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
    if (!baseDir) throw new Error('Cannot access local file storage.');
    const dest = `${baseDir}${fileName}`;

    await FileSystem.writeAsStringAsync(dest, csvContent, { encoding: FileSystem.EncodingType.UTF8 });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(dest, { mimeType: 'text/csv', dialogTitle: 'Download Excel File' });
    } else {
      Alert.alert('Saved', `File saved to: ${dest}`);
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.head}>
            <View>
              <Text style={styles.title}>Export Report</Text>
              <Text style={styles.subtitle}>{getReportName()}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.label}>Export Format</Text>
            <View style={styles.formatRow}>
              <TouchableOpacity
                style={[styles.formatBtn, formatType === 'pdf' && styles.formatBtnActive]}
                onPress={() => setFormatType('pdf')}
              >
                <Ionicons name="document-text" size={20} color={formatType === 'pdf' ? COLORS.white : COLORS.textSecondary} />
                <Text style={[styles.formatBtnText, formatType === 'pdf' && styles.formatBtnTextActive]}>PDF Report</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.formatBtn, formatType === 'excel' && styles.formatBtnActive]}
                onPress={() => setFormatType('excel')}
              >
                <Ionicons name="grid" size={20} color={formatType === 'excel' ? COLORS.white : COLORS.textSecondary} />
                <Text style={[styles.formatBtnText, formatType === 'excel' && styles.formatBtnTextActive]}>Excel Sheet</Text>
              </TouchableOpacity>
            </View>

            {formatType === 'pdf' && (
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Include Brand Logo</Text>
                  <Text style={styles.switchDesc}>Show business branding on the report header</Text>
                </View>
                <Switch
                  value={includeLogo}
                  onValueChange={setIncludeLogo}
                  trackColor={{ false: '#E2E8F0', true: COLORS.primary + '80' }}
                  thumbColor={includeLogo ? COLORS.primary : '#F1F5F9'}
                />
              </View>
            )}

            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={18} color={COLORS.textSecondary} style={{ marginTop: 2 }} />
              <Text style={styles.infoText}>
                The exported file will contain all matching transactions based on your current active dashboard filters.
              </Text>
            </View>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={exporting}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.exportBtn} onPress={handleExport} disabled={exporting}>
              {exporting ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={16} color={COLORS.white} />
                  <Text style={styles.exportText}>Download</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: SPACING.xs,
    borderRadius: RADIUS.md,
  },
  body: {
    gap: SPACING.md,
    marginVertical: SPACING.md,
  },
  label: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  formatRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  formatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surfaceAlt,
  },
  formatBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  formatBtnText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  formatBtnTextActive: {
    color: COLORS.white,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.borderLight,
    marginTop: SPACING.xs,
  },
  switchLabel: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  switchDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
  },
  infoText: {
    flex: 1,
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm + 2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  cancelText: {
    color: COLORS.textSecondary,
    fontWeight: '700',
    fontSize: FONTS.sizes.sm,
  },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.sm + 2,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
  },
  exportText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: FONTS.sizes.sm,
  },
});
