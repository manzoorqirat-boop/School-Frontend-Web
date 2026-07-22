import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/privileges';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, ListItem, EmptyState, Loading, Field, ChipPicker, FormModal, DateField } from '@/components/screen';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const LEAVE_TINT: Record<string, string> = { pending: colors.warning, approved: colors.success, rejected: colors.danger };

const inr = (n?: number) => `₹${Number(n ?? 0).toLocaleString('en-IN')}`;

export default function Payroll() {
  const router = useRouter();
  const { user, school } = useAuth();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);
  const manage = can(user, 'payroll:manage');
  const isTeacher = user?.role === 'teacher';

  const [tab, setTab] = useState<'payslips' | 'leaves'>('payslips');
  const [payslips, setPayslips] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);          // flattened records
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [view, setView] = useState<any>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genForm, setGenForm] = useState<any>({});
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyForm, setApplyForm] = useState<any>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const slipsP = isTeacher && user?._id
        ? API.get(`/api/payroll/teacher/${user._id}`)
        : API.get('/api/payroll?limit=200');
      const leavesP = API.get(isTeacher && user?._id ? `/api/payroll/leaves?teacherId=${user._id}` : '/api/payroll/leaves');
      const [slips, lv] = await Promise.allSettled([slipsP, leavesP]);
      if (slips.status === 'fulfilled') setPayslips(slips.value.items ?? (Array.isArray(slips.value) ? slips.value : []));
      if (lv.status === 'fulfilled') {
        const flat: any[] = [];
        (lv.value.items ?? []).forEach((doc: any) =>
          (doc.records ?? []).forEach((r: any) => flat.push({ ...r, leaveDocId: doc._id, teacherId: doc.teacherId, teacherName: doc.teacherName })));
        flat.sort((a, b) => String(b.fromDate).localeCompare(String(a.fromDate)));
        setLeaves(flat);
      }
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }, [isTeacher, user?._id]);
  useEffect(() => { load(); }, [load]);

  async function loadLeaveTypes() {
    if (leaveTypes.length) return;
    try { const d = await API.get('/api/payroll/leave-types'); setLeaveTypes(d.types ?? []); } catch {}
  }
  async function loadTeachers() {
    if (teachers.length) return;
    try { const d = await API.get('/api/users?role=teacher&limit=100'); setTeachers(d.items ?? []); } catch {}
  }

  // ── Generate payslip (admin) ────────────────────────────────────────────
  function openGenerate() {
    loadTeachers();
    const now = new Date();
    setGenForm({ month: String(now.getMonth() + 1), year: String(now.getFullYear()) });
    setGenOpen(true);
  }
  async function generate() {
    if (!genForm.teacherId) { Alert.alert('Missing', 'Select a teacher.'); return; }
    const month = parseInt(genForm.month);
    const year = parseInt(genForm.year);
    if (isNaN(month) || month < 1 || month > 12) { Alert.alert('Invalid', 'Select a month.'); return; }
    if (isNaN(year) || year < 2000 || year > 2100) { Alert.alert('Invalid', 'Enter a valid 4-digit year.'); return; }
    setSaving(true);
    try {
      const slip = await API.post('/api/payroll/generate/teacher', {
        teacherId: genForm.teacherId, month, year,
      });
      setPayslips(prev => [slip, ...prev.filter(p => p._id !== slip._id)]);
      setGenOpen(false);
    } catch (e: any) { Alert.alert('Failed', e.message); }   // surfaces "no active salary structure" etc.
    finally { setSaving(false); }
  }

  async function toggleLock(slip: any) {
    try {
      const updated = await API.post(`/api/payroll/${slip._id}/${slip.status === 'locked' ? 'unlock' : 'lock'}`);
      setPayslips(prev => prev.map(p => p._id === slip._id ? updated : p));
      setView(updated);
    } catch (e: any) { Alert.alert('Failed', e.message); }
  }

  // ── Leaves ──────────────────────────────────────────────────────────────
  function openApply() {
    loadLeaveTypes();
    if (manage) loadTeachers();
    setApplyForm({ teacherId: isTeacher ? user?._id : '', type: '' });
    setApplyOpen(true);
  }
  async function applyLeave() {
    const f = applyForm;
    if (!f.teacherId) { Alert.alert('Missing', 'Select a teacher.'); return; }
    if (!f.type) { Alert.alert('Missing', 'Select a leave type.'); return; }
    const bad = (v?: string) => !v || !/^\d{4}-\d{2}-\d{2}$/.test(v);
    if (bad(f.fromDate) || bad(f.toDate)) { Alert.alert('Invalid', 'Dates must be YYYY-MM-DD.'); return; }
    if (f.fromDate > f.toDate) { Alert.alert('Invalid', 'From date must be on or before To date.'); return; }
    const days = parseFloat(f.days);
    if (!days || days <= 0) { Alert.alert('Invalid', 'Days must be a positive number (0.5 allowed).'); return; }
    setSaving(true);
    try {
      await API.post('/api/payroll/leaves/apply', {
        teacherId: f.teacherId, academicYear: school?.academicYear ?? '',
        type: f.type, fromDate: f.fromDate, toDate: f.toDate, days, reason: f.reason,
      });
      setApplyOpen(false);
      load();
    } catch (e: any) { Alert.alert('Failed', e.message); }
    finally { setSaving(false); }
  }

  async function setLeaveStatus(rec: any, action: 'approve' | 'reject') {
    try {
      await API.post(`/api/payroll/leaves/${rec.leaveDocId}/records/${rec._id}/${action}`);
      setLeaves(prev => prev.map(r => r._id === rec._id ? { ...r, status: action === 'approve' ? 'approved' : 'rejected' } : r));
    } catch (e: any) { Alert.alert('Failed', e.message); }
  }

  if (loading) return <Screen title={t('nav.payroll', 'Payroll')} colors={rt.gradient} onBack={() => router.back()}><Loading /></Screen>;

  const selTeacher = teachers.find(x => x._id === (genOpen ? genForm.teacherId : applyForm.teacherId));

  return (
    <Screen title={t('nav.payroll', 'Payroll')} subtitle={isTeacher ? 'My payslips & leaves' : 'Payslips & leaves'}
      colors={rt.gradient} onBack={() => router.back()} scroll={false}
      right={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {tab === 'payslips' && manage && (
            <TouchableOpacity onPress={openGenerate} style={[styles.hBtn, { backgroundColor: moduleColor('payroll'), borderColor: moduleColor('payroll') }]}><Ionicons name="add" size={22} color="#fff" /></TouchableOpacity>
          )}
          {tab === 'leaves' && (
            <TouchableOpacity onPress={openApply} style={[styles.hBtn, { backgroundColor: moduleColor('payroll'), borderColor: moduleColor('payroll') }]}><Ionicons name="add" size={22} color="#fff" /></TouchableOpacity>
          )}
        </View>
      }>
      {/* Tabs */}
      <View style={styles.tabs}>
        {(['payslips', 'leaves'] as const).map(tb => (
          <TouchableOpacity key={tb} onPress={() => setTab(tb)}
            style={[styles.tab, tab === tb && styles.tabOn]}>
            <Text style={[styles.tabText, tab === tb && styles.tabTextOn]}>{tb === 'payslips' ? 'Payslips' : 'Leaves'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'payslips' ? (
        <FlatList
          data={payslips}
          keyExtractor={p => p._id}
          contentContainerStyle={{ padding: spacing.lg }}
          ListEmptyComponent={<EmptyState tint={moduleColor('payroll')} icon="cash" text={manage ? 'No payslips. Use + to generate.' : 'No payslips yet.'} />}
          renderItem={({ item: p }) => (
            <ListItem
              title={p.teacherName ?? 'Payslip'}
              subtitle={`${MONTHS[(p.month ?? 1) - 1]} ${p.year} · Net ${inr(p.netPay)}`}
              badge={p.status ?? 'draft'} badgeTint={p.status === 'locked' ? colors.info : p.status === 'paid' ? colors.success : colors.muted}
              onPress={() => setView(p)}
            />
          )}
        />
      ) : (
        <FlatList
          data={leaves}
          keyExtractor={r => r._id}
          contentContainerStyle={{ padding: spacing.lg }}
          ListEmptyComponent={<EmptyState tint={moduleColor('payroll')} icon="airplane" text="No leave applications. Use + to apply." />}
          renderItem={({ item: r }) => (
            <View style={styles.leaveRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.leaveTitle}>{r.teacherName ?? 'Leave'} · {r.type}</Text>
                <Text style={styles.leaveSub}>{String(r.fromDate).slice(0,10)} → {String(r.toDate).slice(0,10)} · {r.days} day(s){r.reason ? ` · ${r.reason}` : ''}</Text>
              </View>
              {r.status === 'pending' && manage ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity onPress={() => setLeaveStatus(r, 'approve')} style={[styles.lvBtn, { backgroundColor: colors.success }]}>
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setLeaveStatus(r, 'reject')} style={[styles.lvBtn, { backgroundColor: colors.danger }]}>
                    <Ionicons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={[styles.lvStatus, { color: LEAVE_TINT[r.status ?? 'pending'] }]}>{r.status ?? 'pending'}</Text>
              )}
            </View>
          )}
        />
      )}

      {/* Payslip detail */}
      <FormModal visible={!!view} title={view ? `${view.teacherName ?? 'Payslip'} · ${MONTHS[(view.month ?? 1) - 1]} ${view.year}` : ''}
        onClose={() => setView(null)} onSubmit={() => setView(null)} submitLabel="Close">
        {view && (
          <View style={{ gap: 4 }}>
            <Sect title="Earnings" />
            {(view.earnings ?? []).map((e: any, i: number) => <Row key={i} k={e.name} v={e.amount} />)}
            <Row k="Gross" v={view.grossPay} bold />
            <Sect title="Deductions" />
            {(view.deductions ?? []).map((d: any, i: number) => <Row key={i} k={d.name} v={d.amount} />)}
            {(view.unpaidLeaveDays ?? 0) > 0 && <Row k={`Unpaid leave (${view.unpaidLeaveDays}d)`} v={view.unpaidLeaveDeduction} />}
            <Row k="Total deductions" v={view.totalDeductions} bold />
            <Sect title="" />
            <Row k="Net pay" v={view.netPay} bold />
            {manage && (
              <TouchableOpacity onPress={() => toggleLock(view)} style={styles.lockBtn}>
                <Ionicons name={view.status === 'locked' ? 'lock-open-outline' : 'lock-closed-outline'} size={16} color={colors.ink} />
                <Text style={styles.lockText}>{view.status === 'locked' ? 'Unlock payslip' : 'Lock payslip'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </FormModal>

      {/* Generate payslip */}
      <FormModal visible={genOpen} title="Generate payslip" onClose={() => setGenOpen(false)}
        onSubmit={generate} submitting={saving} submitLabel="Generate">
        <Text style={styles.hint}>Requires an active salary structure for the teacher (set up in web admin).</Text>
        <TeacherPick teachers={teachers} value={genForm.teacherId} onPick={(id: string) => setGenForm({ ...genForm, teacherId: id })} />
        <ChipPicker label="Month" options={MONTHS.map((_, i) => String(i + 1))} value={genForm.month} onChange={(v) => setGenForm({ ...genForm, month: v })} />
        <Field label="Year" value={genForm.year} keyboardType="numeric" onChangeText={(v: string) => setGenForm({ ...genForm, year: v })} />
      </FormModal>

      {/* Apply leave */}
      <FormModal visible={applyOpen} title="Apply for leave" onClose={() => setApplyOpen(false)}
        onSubmit={applyLeave} submitting={saving} submitLabel="Apply">
        {manage && !isTeacher && (
          <TeacherPick teachers={teachers} value={applyForm.teacherId} onPick={(id: string) => setApplyForm({ ...applyForm, teacherId: id })} />
        )}
        <ChipPicker label="Type *" options={leaveTypes.map((lt: any) => lt.name)} value={applyForm.type} onChange={(v) => setApplyForm({ ...applyForm, type: v })} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><DateField label="From *" value={applyForm.fromDate} onChange={(v) => setApplyForm({ ...applyForm, fromDate: v })} /></View>
          <View style={{ flex: 1 }}><DateField label="To *" value={applyForm.toDate} onChange={(v) => setApplyForm({ ...applyForm, toDate: v })} /></View>
        </View>
        <Field label="Days *" value={applyForm.days} keyboardType="numeric" placeholder="e.g. 1 or 0.5" onChangeText={(v: string) => setApplyForm({ ...applyForm, days: v })} />
        <Field label="Reason" value={applyForm.reason} onChangeText={(v: string) => setApplyForm({ ...applyForm, reason: v })} />
      </FormModal>
    </Screen>
  );
}

function TeacherPick({ teachers, value, onPick }: any) {
  return (
    <View>
      <Text style={styles.pickLabel}>Teacher *</Text>
      {teachers.length === 0 && <Text style={styles.hint}>Loading teachers…</Text>}
      <View style={{ maxHeight: 150 }}>
        <ScrollView>
          {teachers.map((tc: any) => (
            <TouchableOpacity key={tc._id} style={styles.teachRow} onPress={() => onPick(tc._id)}>
              <Ionicons name={value === tc._id ? 'radio-button-on' : 'radio-button-off'} size={18} color={value === tc._id ? colors.primary : colors.muted} />
              <Text style={styles.teachName}>{tc.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function Sect({ title }: { title: string }) {
  return title ? <Text style={styles.sect}>{title}</Text> : <View style={{ height: 6 }} />;
}
function Row({ k, v, bold }: { k: string; v?: number; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowK, bold && { color: colors.ink, fontWeight: '700' }]}>{k}</Text>
      <Text style={[styles.rowV, bold && { fontWeight: '700' }]}>{inr(v)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 3 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
  tabOn: { backgroundColor: colors.surface },
  tabText: { ...font.label, color: colors.muted },
  tabTextOn: { color: colors.ink, fontWeight: '700' },
  leaveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.sm },
  leaveTitle: { ...font.title, color: colors.ink },
  leaveSub: { ...font.label, color: colors.muted, marginTop: 1 },
  lvBtn: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  lvStatus: { ...font.caption },
  sect: { ...font.caption, color: colors.muted, textTransform: 'uppercase', marginTop: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  rowK: { ...font.label, color: colors.slate },
  rowV: { ...font.body, color: colors.ink, fontWeight: '500' },
  lockBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42,
    borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.line, marginTop: spacing.md },
  lockText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  pickLabel: { ...font.label, color: colors.slate },
  teachRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  teachName: { ...font.body, color: colors.ink },
  hint: { ...font.label, color: colors.muted, fontStyle: 'italic' },
});