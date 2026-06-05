import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  fetchSheetData,
  updateSheetRow,
  createSheetRow,
  deleteSheetRow,
  LogEntry
} from '../services/sheetService';

const ACCESS_PASSWORD = process.env.EXPO_PUBLIC_ACCESS_PASSWORD || '1234';

export default function HomeScreen() {
  const [data, setData] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRow, setEditingRow] = useState<LogEntry | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<LogEntry>({
    Date: '',
    Description: '',
    Timing: '',
    Status: ''
  });
  
  const [isAdding, setIsAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newRow, setNewRow] = useState<LogEntry>({
    Date: '',
    Description: '',
    Timing: '',
    Status: 'Pending'
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Auto-hide toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleLogout = async () => {
    try {
      setIsAuthenticated(false);
      await AsyncStorage.removeItem('is_authenticated');
      await AsyncStorage.removeItem('auth_timestamp');
      setPasswordInput('');
    } catch (e) {
      console.error('Logout error', e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await fetchSheetData();
      let lastDate = '';
      const processedResult = result.map((row) => {
        if (row.Date && row.Date.trim() !== '') {
          lastDate = row.Date;
        } else {
          row.Date = lastDate;
        }
        return row;
      });
      setData(
        processedResult.filter(
          (row) => row.Date || row.Description || row.Timing || row.Status
        )
      );
    } catch (err) {
      showToast('Failed to load sheet data');
    } finally {
      setLoading(false);
    }
  };

  // Session check logic
  useEffect(() => {
    const checkSession = async () => {
      try {
        const savedAuth = await AsyncStorage.getItem('is_authenticated');
        const authTimestamp = await AsyncStorage.getItem('auth_timestamp');
        if (savedAuth === 'true' && authTimestamp) {
          const currentTime = Date.now();
          const tenMinutes = 10 * 60 * 1000;
          if (currentTime - parseInt(authTimestamp) > tenMinutes) {
            await handleLogout();
          } else {
            setIsAuthenticated(true);
          }
        }
      } catch (e) {
        console.error('Session check error', e);
      }
    };
    checkSession();
  }, []);

  // Fetch data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
    const today = new Date();
    const formattedDate = `${today.getDate()} ${today.toLocaleString('default', {
      month: 'long'
    })} ${today.getFullYear()}`;
    setNewRow((prev) => ({
      ...prev,
      Date: formattedDate
    }));
  }, [isAuthenticated]);

  const handleLogin = async () => {
    if (passwordInput === ACCESS_PASSWORD) {
      try {
        setIsAuthenticated(true);
        await AsyncStorage.setItem('is_authenticated', 'true');
        await AsyncStorage.setItem('auth_timestamp', Date.now().toString());
        setAuthError(false);
      } catch (e) {
        console.error('Storage authentication set error', e);
      }
    } else {
      setAuthError(true);
      setTimeout(() => setAuthError(false), 2000);
    }
  };

  const filteredData = useMemo(() => {
    let result = [...data];
    if (searchTerm) {
      result = result.filter((i) =>
        i.Description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (statusFilter !== 'All') {
      result = result.filter((i) =>
        i.Status?.toLowerCase().includes(statusFilter.toLowerCase())
      );
    }
    result.sort((a, b) => {
      const dateA = new Date(a.Date);
      const dateB = new Date(b.Date);
      return sortOrder === 'asc' ?
        dateA.getTime() - dateB.getTime() :
        dateB.getTime() - dateA.getTime();
    });
    return result;
  }, [data, searchTerm, statusFilter, sortOrder]);

  const handleAction = async (
    action: 'save' | 'delete' | 'add',
    originalRow: LogEntry | null,
    val?: LogEntry
  ) => {
    if (submitting) return;
    setSubmitting(false);

    if (action === 'delete') {
      Alert.alert(
        'Confirm Delete',
        'Are you sure you want to delete this entry?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => executeAction(action, originalRow, val)
          }
        ]
      );
    } else {
      executeAction(action, originalRow, val);
    }
  };

  const executeAction = async (
    action: 'save' | 'delete' | 'add',
    originalRow: LogEntry | null,
    val?: LogEntry
  ) => {
    setSubmitting(true);
    const fullIdx = originalRow ? data.findIndex((d) => d === originalRow) : -1;
    const sheetRowIndex = fullIdx + 2;

    let res;
    try {
      if (action === 'save' && val) {
        res = await updateSheetRow(sheetRowIndex, val);
      } else if (action === 'delete') {
        res = await deleteSheetRow(sheetRowIndex);
      } else if (action === 'add' && val) {
        res = await createSheetRow(val);
      }

      if (res && res.success) {
        if (action === 'save' && val) {
          const newData = [...data];
          newData[fullIdx] = val;
          setData(newData);
          setEditingRow(null);
          setEditingIndex(null);
        } else if (action === 'delete' || action === 'add') {
          await loadData();
          setIsAdding(false);
          setEditingRow(null);
          setEditingIndex(null);
          // reset form fields
          setNewRow((prev) => ({
            ...prev,
            Description: '',
            Timing: '',
            Status: 'Pending'
          }));
        }
        showToast('Success');
      } else {
        showToast('Operation Failed');
      }
    } catch (err) {
      showToast('An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const completedCount = data.filter((d) =>
    d.Status?.toLowerCase().includes('comp')
  ).length;

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.authKeyboardContainer}
        >
          <View style={styles.authCard}>
            <View style={styles.authLogoContainer}>
              <Feather name="lock" size={32} color="#ffffff" />
            </View>
            <Text style={styles.authTitle}>Access Required</Text>
            <Text style={styles.authSubtitle}>Please enter your password to continue</Text>
            
            <TextInput
              secureTextEntry
              value={passwordInput}
              onChangeText={setPasswordInput}
              placeholder="Enter password"
              placeholderTextColor="#94a3b8"
              style={[
                styles.authInput,
                authError && styles.authInputError
              ]}
              onSubmitEditing={handleLogin}
            />

            {authError && (
              <Text style={styles.errorText}>Incorrect password. Please try again.</Text>
            )}

            <TouchableOpacity style={styles.authButton} onPress={handleLogin}>
              <Text style={styles.authButtonText}>Unlock Access</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Daily Log</Text>
          <Text style={styles.headerSubtitle}>Track your tasks with precision</Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.iconButton} onPress={loadData}>
            <Feather name="refresh-cw" size={20} color="#334155" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={handleLogout}>
            <Feather name="log-out" size={20} color="#334155" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main content scroll */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statTitle}>Total</Text>
            <Text style={styles.statValue}>{data.length}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statTitle}>Completed</Text>
            <Text style={[styles.statValue, { color: '#059669' }]}>{completedCount}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statTitle}>Pending</Text>
            <Text style={[styles.statValue, { color: '#d97706' }]}>
              {data.length - completedCount}
            </Text>
          </View>
        </View>

        {/* Filters */}
        <View style={styles.filterContainer}>
          <View style={styles.searchRow}>
            <Feather name="search" size={18} color="#94a3b8" style={styles.searchIcon} />
            <TextInput
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Search entries..."
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
            />
          </View>
          <View style={styles.filtersRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterTabs}>
              {['All', 'Completed', 'Pending'].map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.filterTab,
                    statusFilter === status && styles.filterTabActive
                  ]}
                  onPress={() => setStatusFilter(status)}
                >
                  <Text
                    style={[
                      styles.filterTabText,
                      statusFilter === status && styles.filterTabTextActive
                    ]}
                  >
                    {status}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.sortButton}
              onPress={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            >
              <Feather
                name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'}
                size={16}
                color="#475569"
              />
              <Text style={styles.sortText}>{sortOrder === 'desc' ? 'Newest' : 'Oldest'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* List Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0f172a" />
          </View>
        ) : (
          <View style={styles.listContainer}>
            {filteredData.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="inbox" size={40} color="#94a3b8" />
                <Text style={styles.emptyText}>No entries found</Text>
              </View>
            ) : (
              filteredData.map((row, index) => {
                const isCompleted = row.Status?.toLowerCase().includes('comp');
                return (
                  <View key={index} style={styles.taskCard}>
                    <View style={styles.taskCardContent}>
                      <Text style={styles.taskDate}>{row.Date}</Text>
                      <Text style={styles.taskDesc}>{row.Description}</Text>
                      <View style={styles.taskMetaRow}>
                        <View style={styles.taskTiming}>
                          <Feather name="clock" size={12} color="#64748b" style={{ marginRight: 4 }} />
                          <Text style={styles.taskTimingText}>{row.Timing}</Text>
                        </View>
                        <View
                          style={[
                            styles.statusBadge,
                            isCompleted ? styles.statusBadgeCompleted : styles.statusBadgePending
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              isCompleted ? styles.statusBadgeTextCompleted : styles.statusBadgeTextPending
                            ]}
                          >
                            {row.Status}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.taskEditButton}
                      onPress={() => {
                        const globalIndex = data.indexOf(row);
                        setEditingIndex(globalIndex);
                        setEditingRow(row);
                        setEditValues({ ...row });
                      }}
                    >
                      <Feather name="edit-3" size={18} color="#475569" />
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* Floating Add Button */}
      <TouchableOpacity style={styles.fab} onPress={() => setIsAdding(true)}>
        <Feather name="plus" size={24} color="#ffffff" />
      </TouchableOpacity>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      {/* Add Entry Modal */}
      <Modal visible={isAdding} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContent}
          >
            <Text style={styles.modalTitle}>New Entry</Text>
            <Text style={styles.modalSubtitle}>Add a new task to your daily log</Text>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                multiline
                numberOfLines={3}
                placeholder="What are you working on?"
                placeholderTextColor="#94a3b8"
                value={newRow.Description}
                onChangeText={(text) => setNewRow({ ...newRow, Description: text })}
                style={[styles.modalInput, styles.modalTextarea]}
              />

              <View style={styles.formRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.inputLabel}>Date</Text>
                  <TextInput
                    value={newRow.Date}
                    onChangeText={(text) => setNewRow({ ...newRow, Date: text })}
                    style={styles.modalInput}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.inputLabel}>Timing</Text>
                  <TextInput
                    placeholder="e.g. 10:00 AM"
                    placeholderTextColor="#94a3b8"
                    value={newRow.Timing}
                    onChangeText={(text) => setNewRow({ ...newRow, Timing: text })}
                    style={styles.modalInput}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Status</Text>
              <TextInput
                placeholder="e.g. Pending or Completed"
                placeholderTextColor="#94a3b8"
                value={newRow.Status}
                onChangeText={(text) => setNewRow({ ...newRow, Status: text })}
                style={styles.modalInput}
              />
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setIsAdding(false)}
                disabled={submitting}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSubmit]}
                onPress={() => handleAction('add', null, newRow)}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalButtonSubmitText}>Add Entry</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Edit Entry Modal */}
      <Modal visible={editingRow !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContent}
          >
            <Text style={styles.modalTitle}>Edit Entry</Text>
            <Text style={styles.modalSubtitle}>Modify your logged task details</Text>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                multiline
                numberOfLines={3}
                placeholder="Description"
                placeholderTextColor="#94a3b8"
                value={editValues.Description}
                onChangeText={(text) => setEditValues({ ...editValues, Description: text })}
                style={[styles.modalInput, styles.modalTextarea]}
              />

              <View style={styles.formRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.inputLabel}>Date</Text>
                  <TextInput
                    value={editValues.Date}
                    onChangeText={(text) => setEditValues({ ...editValues, Date: text })}
                    style={styles.modalInput}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.inputLabel}>Timing</Text>
                  <TextInput
                    value={editValues.Timing}
                    onChangeText={(text) => setEditValues({ ...editValues, Timing: text })}
                    style={styles.modalInput}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Status</Text>
              <TextInput
                value={editValues.Status}
                onChangeText={(text) => setEditValues({ ...editValues, Status: text })}
                style={styles.modalInput}
              />
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDelete]}
                onPress={() => handleAction('delete', editingRow)}
                disabled={submitting}
              >
                <Text style={styles.modalButtonDeleteText}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel, { flex: 1 }]}
                onPress={() => setEditingRow(null)}
                disabled={submitting}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSubmit, { flex: 1 }]}
                onPress={() => handleAction('save', editingRow, editValues)}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalButtonSubmitText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80
  },
  // Auth view styles
  authContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center'
  },
  authKeyboardContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 16
  },
  authCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 32,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
    alignItems: 'center'
  },
  authLogoContainer: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20
  },
  authTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center'
  },
  authSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 24,
    textAlign: 'center'
  },
  authInput: {
    width: '100%',
    height: 52,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    textAlign: 'center',
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    marginBottom: 16
  },
  authInputError: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2'
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center'
  },
  authButton: {
    width: '100%',
    height: 52,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  authButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600'
  },
  // Header styles
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a'
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8
  },
  // Stats card styles
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 10
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2
  },
  statTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a'
  },
  // Filter bar styles
  filterContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 20
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 10
  },
  searchIcon: {
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
    paddingVertical: 8
  },
  filtersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  filterTabs: {
    flexDirection: 'row'
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6
  },
  filterTabActive: {
    backgroundColor: '#f1f5f9'
  },
  filterTabText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500'
  },
  filterTabTextActive: {
    color: '#0f172a',
    fontWeight: '600'
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  sortText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
    marginLeft: 4
  },
  // Task card list styles
  listContainer: {
    gap: 12
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center'
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyText: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 12,
    fontWeight: '500'
  },
  taskCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.01,
    shadowRadius: 2
  },
  taskCardContent: {
    flex: 1
  },
  taskDate: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6
  },
  taskDesc: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    lineHeight: 22,
    marginBottom: 10
  },
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  taskTiming: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8
  },
  taskTimingText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500'
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6
  },
  statusBadgeCompleted: {
    backgroundColor: '#d1fae5'
  },
  statusBadgePending: {
    backgroundColor: '#fef3c7'
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  statusBadgeTextCompleted: {
    color: '#047857'
  },
  statusBadgeTextPending: {
    color: '#b45309'
  },
  taskEditButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12
  },
  // Floating Action Button
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8
  },
  // Toast styles
  toast: {
    position: 'absolute',
    bottom: 96,
    alignSelf: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    zIndex: 100
  },
  toastText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '85%'
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 20
  },
  modalForm: {
    marginBottom: 20
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6
  },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#0f172a',
    marginBottom: 16
  },
  modalTextarea: {
    height: 80,
    paddingTop: 12,
    textAlignVertical: 'top'
  },
  formRow: {
    flexDirection: 'row'
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10
  },
  modalButton: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalButtonCancel: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 24
  },
  modalButtonCancelText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '600'
  },
  modalButtonSubmit: {
    backgroundColor: '#0f172a',
    flex: 2
  },
  modalButtonSubmitText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600'
  },
  modalButtonDelete: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fee2e2',
    paddingHorizontal: 16
  },
  modalButtonDeleteText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600'
  }
});
