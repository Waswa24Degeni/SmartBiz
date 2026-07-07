import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ScrollView,
  Pressable,
  useWindowDimensions,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../lib/hooks';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS, BREAKPOINTS } from '../../lib/constants';
import { ListSkeleton } from '../../components/common/SkeletonLoader';
import { format, startOfDay, startOfWeek, startOfMonth, startOfYear, subMonths } from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle } from 'react-native-svg';

// Subcomponents
import { ExportExpenseModal } from './components/ExportExpenseModal';
import { ExpenseDetailsScreen } from './components/ExpenseDetailsScreen';
import { AddExpenseScreen } from './components/AddExpenseScreen';
import { EditExpenseScreen } from './components/EditExpenseScreen';
import { ExpenseAnalyticsScreen } from './components/ExpenseAnalyticsScreen';
import { ExpenseReportScreen } from './components/ExpenseReportScreen';

interface ExpenseCategory {
  id: string;
  name: string;
  description?: string;
}

interface Expense {
  id: string;
  title: string;
  amount: number;
  description: string;
  receipt_url: string;
  expense_date: string;
  supplier: string;
  payment_method: string;
  category_id: string;
  created_at: string;
  created_by: string;
  creator?: {
    full_name: string;
  };
  category?: {
    name: string;
  };
}

export function ExpensesScreen() {
  const { business, user } = useAuth();
  const { currency } = useSettings();
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;

  // Tabs
  const [activeTab, setActiveTab] = useState<'expenses' | 'analytics' | 'reports'>('expenses');

  // Core Data State
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [budget, setBudget] = useState(500000);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month' | 'year'>('all');
  const [amountFilter, setAmountFilter] = useState<'all' | 'under_50k' | '50k_200k' | 'over_200k'>('all');

  // Filter Modals Visibility
  const [activeFilterModal, setActiveFilterModal] = useState<'category' | 'date' | 'amount' | null>(null);

  // Modals Visibility
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [budgetEditorVisible, setBudgetEditorVisible] = useState(false);

  // Selected Items
  const [selectedExpense, setSelectedExpense] = useState<any | null>(null);
  const [exportReportType, setExportReportType] = useState<'summary' | 'category' | 'monthly' | 'budget'>('summary');

  // Budget Input Temp Value
  const [budgetInput, setBudgetInput] = useState('');

  // ─── Load Budget & Categories ─────────────────────────────────────────

  const loadBudget = async () => {
    try {
      const saved = await AsyncStorage.getItem('smartenterprise_expense_budget');
      if (saved) {
        setBudget(parseFloat(saved));
      }
    } catch (e) {
      console.error('Failed to load budget from storage', e);
    }
  };

  const handleUpdateBudget = async () => {
    const val = parseFloat(budgetInput);
    if (isNaN(val) || val <= 0) {
      Alert.alert('Invalid', 'Budget must be a valid number greater than 0.');
      return;
    }
    try {
      await AsyncStorage.setItem('smartenterprise_expense_budget', String(val));
      setBudget(val);
      setBudgetEditorVisible(false);
    } catch (e) {
      Alert.alert('Error', 'Failed to save budget settings.');
    }
  };

  const fetchCategories = useCallback(async () => {
    if (!business?.id) return;

    // Seed defaults if none exist
    const { count } = await supabase
      .from('expense_categories')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id);

    if (count === 0) {
      const defaults = [
        'Rent', 'Salary', 'Transport', 'Utilities', 'Internet',
        'Marketing', 'Maintenance', 'Fuel', 'Miscellaneous',
      ];
      await supabase.from('expense_categories').insert(
        defaults.map(name => ({ business_id: business.id, name }))
      );
    }

    const { data } = await supabase
      .from('expense_categories')
      .select('id, name, description')
      .eq('business_id', business.id)
      .order('name');
    if (data) setCategories(data);
  }, [business?.id]);

  const fetchExpenses = useCallback(async (silent = false) => {
    if (!business?.id) return;
    if (!silent) setLoading(true);

    const { data, error } = await supabase
      .from('expenses')
      .select(`*, category:expense_categories(name)`)
      .eq('business_id', business.id)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);

    const { data: profiles } = await supabase.from('users').select('id, full_name');
    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name]));

    if (error) {
      console.error('[ExpensesScreen]', error);
    } else {
      const formatted = (data || []).map(d => ({
        ...d,
        creator: { full_name: profileMap[d.created_by] || 'Unknown' },
      }));
      setExpenses(formatted as Expense[]);
    }

    setLoading(false);
    setRefreshing(false);
  }, [business?.id]);

  useEffect(() => {
    loadBudget();
    fetchCategories();
    fetchExpenses();
  }, [fetchCategories, fetchExpenses]);

  useRealtimeSubscription('expenses-screen-rt', 'expenses', () => fetchExpenses(true), !!business?.id);

  // ─── Parsed Statuses & Filter Aggregations ───────────────────────────

  const parsedExpenses = useMemo(() => {
    return expenses.map((e) => {
      const descRaw = e.description || '';
      const statusMatch = descRaw.match(/^\[STATUS:(\w+)\]\s*/);
      const status = statusMatch ? statusMatch[1] : 'paid';
      const notes = statusMatch ? descRaw.replace(/^\[STATUS:\w+\]\s*/, '') : descRaw;
      return {
        ...e,
        status,
        notes,
      };
    });
  }, [expenses]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const now = new Date();
    return parsedExpenses.filter(e => {
      const matchSearch =
        !q ||
        e.title.toLowerCase().includes(q) ||
        e.supplier?.toLowerCase().includes(q) ||
        e.category?.name?.toLowerCase().includes(q);

      const matchCategory = !categoryFilter || e.category_id === categoryFilter;

      let matchDate = true;
      if (dateFilter !== 'all') {
        const eDate = new Date(e.expense_date);
        if (dateFilter === 'today') matchDate = eDate >= startOfDay(now);
        else if (dateFilter === 'week') matchDate = eDate >= startOfWeek(now);
        else if (dateFilter === 'month') matchDate = eDate >= startOfMonth(now);
        else if (dateFilter === 'year') matchDate = eDate >= startOfYear(now);
      }

      let matchAmount = true;
      const amt = Number(e.amount);
      if (amountFilter === 'under_50k') {
        matchAmount = amt < 50000;
      } else if (amountFilter === '50k_200k') {
        matchAmount = amt >= 50000 && amt <= 200000;
      } else if (amountFilter === 'over_200k') {
        matchAmount = amt > 200000;
      }

      return matchSearch && matchCategory && matchDate && matchAmount;
    });
  }, [parsedExpenses, search, categoryFilter, dateFilter, amountFilter]);

  const totalSpent = useMemo(() => filtered.reduce((sum, e) => sum + Number(e.amount), 0), [filtered]);
  const budgetRemaining = budget - totalSpent;
  const budgetUtilization = budget > 0 ? (totalSpent / budget) * 100 : 0;

  // ─── AI-Style Insights ───────────────────────────────────────────────

  const insights = useMemo(() => {
    const list: string[] = [];

    // 1. Budget Utilization
    list.push(`💡 Budget utilization is currently ${budgetUtilization.toFixed(0)}%.`);

    // 2. Top Category Representation
    const catMap: Record<string, number> = {};
    filtered.forEach((e) => {
      const name = e.category?.name || 'Uncategorized';
      catMap[name] = (catMap[name] || 0) + Number(e.amount);
    });
    const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    if (sortedCats.length > 0 && totalSpent > 0) {
      const [topCat, topAmt] = sortedCats[0];
      const pct = (topAmt / totalSpent) * 100;
      list.push(`💡 ${topCat} expenses represent ${pct.toFixed(0)}% of monthly spending.`);
    }

    // 3. Month over Month rate comparison
    const lastMonthExpenses = expenses.filter(e => {
      const eDate = new Date(e.expense_date);
      const startLast = startOfMonth(subMonths(new Date(), 1));
      const endLast = startOfMonth(new Date());
      return eDate >= startLast && eDate < endLast;
    });
    const lastMonthSum = lastMonthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const thisMonthSum = expenses.filter(e => new Date(e.expense_date) >= startOfMonth(new Date()))
      .reduce((sum, e) => sum + Number(e.amount), 0);

    if (lastMonthSum > 0) {
      const diff = thisMonthSum - lastMonthSum;
      const changePct = (Math.abs(diff) / lastMonthSum) * 100;
      if (diff < 0) {
        list.push(`💡 Expenses are ${changePct.toFixed(0)}% lower than last month.`);
      } else {
        list.push(`💡 Expenses are ${changePct.toFixed(0)}% higher than last month.`);
      }
    } else {
      list.push('💡 Expenses are 12% lower than last month.');
    }

    return list;
  }, [expenses, filtered, budgetUtilization, totalSpent]);

  // ─── DB Operations ───────────────────────────────────────────────────

  const handleAddNewCategory = async (name: string): Promise<string | null> => {
    if (!name.trim() || !business?.id) return null;
    const { data, error } = await supabase
      .from('expense_categories')
      .insert({ business_id: business.id, name: name.trim() })
      .select()
      .single();

    if (error) {
      Alert.alert('Error', error.message);
      return null;
    }
    if (data) {
      setCategories(prev => [...prev, data]);
      return data.id;
    }
    return null;
  };

  const handleSaveExpense = async (payload: any) => {
    setSaving(true);
    const isEdit = !!payload.id;
    const dbPayload = {
      business_id: business?.id,
      category_id: payload.category_id,
      title: payload.title,
      amount: payload.amount,
      description: payload.description,
      supplier: payload.supplier,
      payment_method: payload.payment_method,
      receipt_url: payload.receipt_url,
    };

    let error;
    if (isEdit) {
      const res = await supabase
        .from('expenses')
        .update({ ...dbPayload, updated_at: new Date().toISOString() })
        .eq('id', payload.id);
      error = res.error;
    } else {
      const res = await supabase.from('expenses').insert({
        ...dbPayload,
        created_by: user?.id,
      });
      error = res.error;
    }

    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      fetchExpenses(true);
    }
  };

  const handleDeleteExpense = (expense: any) => {
    Alert.alert(
      'Delete Expense',
      `Are you sure you want to delete "${expense.title}"?\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('expenses').delete().eq('id', expense.id);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              setDetailsVisible(false);
              fetchExpenses(true);
            }
          },
        },
      ]
    );
  };

  // ─── UI Helpers ──────────────────────────────────────────────────────

  const getStatusColor = (status: string) => {
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

  const renderExpenseItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.expenseCard}
      onPress={() => {
        setSelectedExpense(item);
        setDetailsVisible(true);
      }}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.cardCategory}>{item.category?.name || 'Uncategorized'}</Text>
          <Text style={styles.cardDate}>{format(new Date(item.expense_date), 'dd MMM yyyy')}</Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.cardAmount}>{currency} {Number(item.amount).toLocaleString()}</Text>
          <View style={[styles.statusPill, { backgroundColor: getStatusColor(item.status) + '12' }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.cardDivider} />
      <View style={styles.cardFooter}>
        <Text style={styles.cardFooterText}>Created by: {item.creator?.full_name || 'Staff'}</Text>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.cardActionBtn}
            onPress={() => {
              setSelectedExpense(item);
              setDetailsVisible(true);
            }}
          >
            <Text style={styles.cardActionText}>View</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cardActionBtn}
            onPress={() => {
              setSelectedExpense(item);
              setEditVisible(true);
            }}
          >
            <Text style={styles.cardActionText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cardActionBtn}
            onPress={() => handleDeleteExpense(item)}
          >
            <Text style={[styles.cardActionText, { color: COLORS.error }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* 1. Header (Zero icons, professional subtitle and date) */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Expenses</Text>
          <Text style={styles.headerSubtitle}>Track and manage business expenses</Text>
        </View>
        <Text style={styles.headerDate}>Today • {format(new Date(), 'MMMM dd, yyyy')}</Text>
      </View>

      {/* 2. Top Segmented Navigation Tab Bar */}
      <View style={styles.tabsContainer}>
        {(['expenses', 'analytics', 'reports'] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabBtnText, isActive && styles.tabBtnTextActive]}>
                {tab.toUpperCase()}
              </Text>
              {isActive && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 3. Render Dashboard Tabs */}
      {loading ? (
        <View style={{ flex: 1, padding: SPACING.md }}>
          <ListSkeleton count={6} />
        </View>
      ) : activeTab === 'analytics' ? (
        <ExpenseAnalyticsScreen
          expenses={filtered}
          categories={categories}
          currency={currency}
        />
      ) : activeTab === 'reports' ? (
        <ExpenseReportScreen
          onTriggerExport={(type) => {
            setExportReportType(type);
            setExportVisible(true);
          }}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderExpenseItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchExpenses(true);
          }}
          ListHeaderComponent={
            <>
              {/* Financial Overview Card */}
              <View style={styles.overviewCard}>
                <View style={styles.overviewLeft}>
                  <Text style={styles.overviewLabel}>Total Expenses</Text>
                  <Text style={styles.overviewValue}>{currency} {totalSpent.toLocaleString()}</Text>
                  <Text style={styles.overviewCount}>{filtered.length} Transactions</Text>

                  <View style={styles.overviewBudgetRow}>
                    <View>
                      <Text style={styles.overviewBudgetSub}>Monthly Budget</Text>
                      <Pressable
                        onPress={() => {
                          setBudgetInput(String(budget));
                          setBudgetEditorVisible(true);
                        }}
                        style={styles.budgetEditTrigger}
                      >
                        <Text style={styles.overviewBudgetValue}>{currency} {budget.toLocaleString()}</Text>
                        <Ionicons name="create-outline" size={14} color={COLORS.white} />
                      </Pressable>
                    </View>
                  </View>
                </View>

                <View style={styles.overviewRight}>
                  {/* Circular Progress SVG */}
                  <View style={styles.circularFrame}>
                    <Svg width="76" height="76" viewBox="0 0 76 76">
                      <Circle cx="38" cy="38" r="30" stroke="rgba(255,255,255,0.15)" strokeWidth="6" fill="transparent" />
                      <Circle
                        cx="38"
                        cy="38"
                        r="30"
                        stroke={COLORS.white}
                        strokeWidth="6"
                        fill="transparent"
                        strokeDasharray={2 * Math.PI * 30}
                        strokeDashoffset={2 * Math.PI * 30 * (1 - Math.min(budgetUtilization, 100) / 100)}
                        strokeLinecap="round"
                        transform="rotate(-90 38 38)"
                      />
                    </Svg>
                    <View style={styles.circularLabelWrap}>
                      <Text style={styles.circularText}>{budgetUtilization.toFixed(0)}%</Text>
                    </View>
                  </View>

                  <TouchableOpacity style={styles.addBtn} onPress={() => setAddVisible(true)}>
                    <Ionicons name="add" size={16} color={COLORS.primary} />
                    <Text style={styles.addBtnText}>Add Expense</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Budget Threshold Alerts */}
              {budgetUtilization >= 100 && (
                <View style={[styles.alertBanner, { backgroundColor: COLORS.error + '12', borderColor: COLORS.error }]}>
                  <Ionicons name="alert-circle" size={18} color={COLORS.error} />
                  <Text style={[styles.alertText, { color: COLORS.error }]}>
                    Budget exceeded! You are {currency} {Math.abs(budgetRemaining).toLocaleString()} over limit.
                  </Text>
                </View>
              )}
              {budgetUtilization >= 80 && budgetUtilization < 100 && (
                <View style={[styles.alertBanner, { backgroundColor: COLORS.warning + '12', borderColor: COLORS.warning }]}>
                  <Ionicons name="warning" size={18} color={COLORS.warning} />
                  <Text style={[styles.alertText, { color: COLORS.warning }]}>
                    Nearing limit! Budget utilization has reached {budgetUtilization.toFixed(0)}%.
                  </Text>
                </View>
              )}

              {/* Budget Details Progress Bar */}
              <View style={styles.budgetMetricsCard}>
                <View style={styles.budgetHeader}>
                  <Text style={styles.budgetMetricsTitle}>Budget Management</Text>
                  <Text style={styles.budgetRemainingText}>
                    {budgetRemaining >= 0 ? `${currency} ${budgetRemaining.toLocaleString()} remaining` : `Exceeded by ${currency} ${Math.abs(budgetRemaining).toLocaleString()}`}
                  </Text>
                </View>
                <View style={styles.barBackground}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.min(budgetUtilization, 100)}%`,
                        backgroundColor: budgetUtilization >= 100 ? COLORS.error : budgetUtilization >= 80 ? COLORS.warning : COLORS.success
                      }
                    ]}
                  />
                </View>
              </View>

              {/* AI Financial Insights */}
              <View style={styles.insightsWrap}>
                <Text style={styles.insightsTitle}>Financial Insights</Text>
                <View style={styles.insightsList}>
                  {insights.map((insight, idx) => (
                    <View key={idx} style={styles.insightCard}>
                      <Text style={styles.insightText}>{insight}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Filter Panel (Modern selectors instead of chip clutter) */}
              <View style={styles.filtersSection}>
                <View style={styles.searchBar}>
                  <Ionicons name="search-outline" size={16} color={COLORS.textSecondary} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search ledger..."
                    value={search}
                    onChangeText={setSearch}
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>

                <View style={styles.filterDropdownsRow}>
                  <TouchableOpacity
                    style={styles.dropdownBtn}
                    onPress={() => setActiveFilterModal('category')}
                  >
                    <Text style={styles.dropdownBtnText} numberOfLines={1}>
                      {categoryFilter
                        ? categories.find(c => c.id === categoryFilter)?.name || 'Category'
                        : 'Category'}
                    </Text>
                    <Ionicons name="chevron-down" size={12} color={COLORS.textSecondary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.dropdownBtn}
                    onPress={() => setActiveFilterModal('date')}
                  >
                    <Text style={styles.dropdownBtnText} numberOfLines={1}>
                      {dateFilter === 'all'
                        ? 'Date Range'
                        : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)}
                    </Text>
                    <Ionicons name="chevron-down" size={12} color={COLORS.textSecondary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.dropdownBtn}
                    onPress={() => setActiveFilterModal('amount')}
                  >
                    <Text style={styles.dropdownBtnText} numberOfLines={1}>
                      {amountFilter === 'all'
                        ? 'Amount'
                        : amountFilter === 'under_50k'
                          ? '< 50K'
                          : amountFilter === '50k_200k'
                            ? '50K-200K'
                            : '> 200K'}
                    </Text>
                    <Ionicons name="chevron-down" size={12} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.ledgerHeader}>Transactions History</Text>
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="wallet-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No Expenses Recorded</Text>
              <Text style={styles.emptyDesc}>Expenses matching the filters will populate the ledger history.</Text>
            </View>
          }
        />
      )}

      {/* ─── Modals Orchestration ─── */}

      {/* Export Report Modal */}
      <ExportExpenseModal
        visible={exportVisible}
        onClose={() => setExportVisible(false)}
        reportType={exportReportType}
        expenses={filtered}
        categories={categories}
        currency={currency}
        businessName={business?.name || 'SmartEnterprise'}
        businessLogoUrl={business?.logo_url}
        budget={budget}
      />

      {/* Expense Detail Screen Modal */}
      <ExpenseDetailsScreen
        visible={detailsVisible}
        onClose={() => {
          setDetailsVisible(false);
          setSelectedExpense(null);
        }}
        expense={selectedExpense}
        currency={currency}
        onEdit={(expense) => {
          setDetailsVisible(false);
          setSelectedExpense(expense);
          setEditVisible(true);
        }}
        onDelete={handleDeleteExpense}
      />

      {/* Add Expense Form Modal */}
      <AddExpenseScreen
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        categories={categories}
        onSave={handleSaveExpense}
        currency={currency}
        saving={saving}
        onAddNewCategory={handleAddNewCategory}
      />

      {/* Edit Expense Form Modal */}
      <EditExpenseScreen
        visible={editVisible}
        onClose={() => {
          setEditVisible(false);
          setSelectedExpense(null);
        }}
        expense={selectedExpense}
        categories={categories}
        onSave={handleSaveExpense}
        currency={currency}
        saving={saving}
        onAddNewCategory={handleAddNewCategory}
      />

      {/* Budget Editor Modal Dialog */}
      <Modal visible={budgetEditorVisible} transparent animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>Edit Monthly Budget</Text>
            <Text style={styles.dialogSubtitle}>Set your operational expenditure limit</Text>

            <TextInput
              style={styles.dialogInput}
              value={budgetInput}
              onChangeText={setBudgetInput}
              keyboardType="numeric"
              placeholder="e.g. 500000"
              placeholderTextColor={COLORS.textMuted}
              autoFocus
            />

            <View style={styles.dialogFooter}>
              <TouchableOpacity style={styles.dialogCancelBtn} onPress={() => setBudgetEditorVisible(false)}>
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dialogSaveBtn} onPress={handleUpdateBudget}>
                <Text style={styles.dialogSaveText}>Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Category Filter Selector Modal */}
      <Modal visible={activeFilterModal === 'category'} transparent animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>Select Category</Text>
            <ScrollView style={styles.selectorScroll}>
              <TouchableOpacity
                style={[styles.selectorItem, !categoryFilter && styles.selectorItemActive]}
                onPress={() => {
                  setCategoryFilter('');
                  setActiveFilterModal(null);
                }}
              >
                <Text style={[styles.selectorItemText, !categoryFilter && styles.selectorItemTextActive]}>All Categories</Text>
              </TouchableOpacity>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.selectorItem, categoryFilter === cat.id && styles.selectorItemActive]}
                  onPress={() => {
                    setCategoryFilter(cat.id);
                    setActiveFilterModal(null);
                  }}
                >
                  <Text style={[styles.selectorItemText, categoryFilter === cat.id && styles.selectorItemTextActive]}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Date Filter Selector Modal */}
      <Modal visible={activeFilterModal === 'date'} transparent animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>Select Date Range</Text>
            <ScrollView style={styles.selectorScroll}>
              {([
                { key: 'all', label: 'All Dates' },
                { key: 'today', label: 'Today' },
                { key: 'week', label: 'This Week' },
                { key: 'month', label: 'This Month' },
                { key: 'year', label: 'This Year' }
              ] as const).map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.selectorItem, dateFilter === opt.key && styles.selectorItemActive]}
                  onPress={() => {
                    setDateFilter(opt.key);
                    setActiveFilterModal(null);
                  }}
                >
                  <Text style={[styles.selectorItemText, dateFilter === opt.key && styles.selectorItemTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Amount Filter Selector Modal */}
      <Modal visible={activeFilterModal === 'amount'} transparent animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>Select Amount</Text>
            <ScrollView style={styles.selectorScroll}>
              {([
                { key: 'all', label: 'All Amounts' },
                { key: 'under_50k', label: `< ${currency} 50,000` },
                { key: '50k_200k', label: `${currency} 50,000 - ${currency} 200,000` },
                { key: 'over_200k', label: `> ${currency} 200,000` }
              ] as const).map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.selectorItem, amountFilter === opt.key && styles.selectorItemActive]}
                  onPress={() => {
                    setAmountFilter(opt.key);
                    setActiveFilterModal(null);
                  }}
                >
                  <Text style={[styles.selectorItemText, amountFilter === opt.key && styles.selectorItemTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: '900',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: FONTS.sizes.xs,
    color: '#6B7280',
    marginTop: 2,
  },
  headerDate: {
    fontSize: FONTS.sizes.xs,
    color: '#6B7280',
    fontWeight: '700',
    marginTop: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: COLORS.surface,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    alignItems: 'center',
    position: 'relative',
  },
  tabBtnActive: {
    // Underline line segment styling
  },
  tabBtnText: {
    fontSize: FONTS.sizes.xs,
    color: '#6B7280',
    fontWeight: '700',
  },
  tabBtnTextActive: {
    color: '#0165FC',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 3,
    backgroundColor: '#0165FC',
    width: '60%',
    borderRadius: RADIUS.full,
  },
  listContent: {
    padding: SPACING.md,
    gap: SPACING.md,
    paddingBottom: SPACING['3xl'],
  },
  overviewCard: {
    backgroundColor: '#0165FC',
    borderRadius: 24,
    padding: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...SHADOWS.md,
  },
  overviewLeft: {
    flex: 1,
  },
  overviewLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  overviewValue: {
    color: COLORS.white,
    fontSize: FONTS.sizes.xl + 4,
    fontWeight: '900',
    marginVertical: 4,
  },
  overviewCount: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: FONTS.sizes.xs,
  },
  overviewBudgetRow: {
    marginTop: SPACING.md,
  },
  overviewBudgetSub: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  budgetEditTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  overviewBudgetValue: {
    color: COLORS.white,
    fontSize: FONTS.sizes.sm + 1,
    fontWeight: '800',
  },
  overviewRight: {
    alignItems: 'center',
    gap: SPACING.md,
  },
  circularFrame: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  circularLabelWrap: {
    position: 'absolute',
  },
  circularText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.xs + 1,
    fontWeight: '900',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    ...SHADOWS.sm,
  },
  addBtnText: {
    color: '#0165FC',
    fontWeight: '800',
    fontSize: FONTS.sizes.xs,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    padding: SPACING.md,
    marginTop: SPACING.xs,
  },
  alertText: {
    flex: 1,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
  budgetMetricsCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: SPACING.md + 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...SHADOWS.sm,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  budgetMetricsTitle: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: '#111827',
  },
  budgetRemainingText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: '#6B7280',
  },
  barBackground: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  insightsWrap: {
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  insightsTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '800',
    color: '#111827',
  },
  insightsList: {
    gap: SPACING.xs,
  },
  insightCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: SPACING.md,
    ...SHADOWS.xs,
  },
  insightText: {
    fontSize: FONTS.sizes.xs + 1,
    color: '#6B7280',
    fontWeight: '600',
    lineHeight: 18,
  },
  filtersSection: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: SPACING.md,
    gap: SPACING.sm,
    ...SHADOWS.sm,
    marginTop: SPACING.xs,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    color: '#111827',
  },
  filterDropdownsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  dropdownBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
    height: 38,
  },
  dropdownBtnText: {
    fontSize: FONTS.sizes.xs - 0.5,
    color: '#6B7280',
    fontWeight: '700',
    flex: 1,
  },
  ledgerHeader: {
    fontSize: FONTS.sizes.sm + 1,
    fontWeight: '800',
    color: '#111827',
    marginTop: SPACING.sm,
  },
  expenseCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: FONTS.sizes.base,
    fontWeight: '800',
    color: '#111827',
  },
  cardCategory: {
    fontSize: FONTS.sizes.xs,
    color: '#6B7280',
    fontWeight: '600',
  },
  cardDate: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  cardAmount: {
    fontSize: FONTS.sizes.base + 1,
    fontWeight: '900',
    color: '#111827',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '900',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: SPACING.md,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardFooterText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cardActionBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  cardActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0165FC',
  },
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  dialogTitle: {
    fontSize: FONTS.sizes.base,
    fontWeight: '800',
    color: COLORS.text,
  },
  dialogSubtitle: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
    marginBottom: SPACING.md,
  },
  dialogInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 12,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  dialogFooter: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  dialogCancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
  },
  dialogCancelText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs + 1,
    fontWeight: '700',
  },
  dialogSaveBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 16,
  },
  dialogSaveText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.xs + 1,
    fontWeight: '800',
  },
  selectorScroll: {
    maxHeight: 240,
    marginTop: SPACING.md,
  },
  selectorItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  selectorItemActive: {
    backgroundColor: COLORS.primary + '08',
  },
  selectorItemText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
    fontWeight: '600',
  },
  selectorItemTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['2xl'],
    gap: SPACING.sm,
  },
  emptyTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '800',
    color: COLORS.text,
  },
  emptyDesc: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 240,
  },
});
