import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/privileges';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, Field, Collapsible, Loading, EmptyState, AcademicYearPicker, FormModal } from '@/components/screen';
import { GradientButton } from '@/components/ui';

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Editable master data for the school. These lists drive the class/section
// pickers on every other screen (via useSchoolConfig), so changes here
// propagate app-wide after the next refresh.
export default function SchoolSetup() {
  const router = useRouter();
  const { user, school, refreshSchool } = useAuth();
  const rt = themeForRole(user?.role);
  const editable = can(user, 'school:settings');

  const [form, setForm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Leave types live on a different endpoint (payroll), edited in its own modal.
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [ltOpen, setLtOpen] = useState(false);
  const [ltDraft, setLtDraft] = useState<any[]>([]);
  const [requireApproval, setRequireApproval] = useState(true);

  useEffect(() => { load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    try {
      const s = school?._id ? await API.get(`/api/schools/${school._id}`) : school;
      setForm({ ...s, classes: [...(s?.classes ?? [])], sections: [...(s?.sections ?? [])], workingDays: [...(s?.workingDays ?? [])] });
      try {
        const lt = await API.get('/api/payroll/leave-types');
        setLeaveTypes(lt.types ?? []);
        setRequireApproval(lt.requireApproval !== false);
      } catch { /* payroll may be out of scope for this role */ }
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  // ── List editors (classes / sections) ───────────────────────────────────
  function addItem(key: 'classes' | 'sections', value: string) {
    const v = value.trim();
    if (!v) return;
    const cur = form[key] ?? [];
    if (cur.some((x: string) => x.toLowerCase() === v.toLowerCase())) { Alert.alert('Duplicate', `"${v}" is already in the list.`); return; }
    set(key, [...cur, v]);
  }
  function removeItem(key: 'classes' | 'sections', i: number) {
    set(key, (form[key] ?? []).filter((_: any, j: number) => j !== i));
  }
  function moveItem(key: 'classes' | 'sections', i: number, dir: -1 | 1) {
    const cur = [...(form[key] ?? [])];
    const j = i + dir;
    if (j < 0 || j >= cur.length) return;
    [cur[i], cur[j]] = [cur[j], cur[i]];
    set(key, cur);
  }
  function toggleDay(d: string) {
    const cur = form.workingDays ?? [];
    set('workingDays', cur.includes(d) ? cur.filter((x: string) => x !== d) : [...cur, d]);
  }

  async function save() {
    if (!form?.classes?.length) { Alert.alert('Missing', 'Add at least one class — the class pickers across the app depend on this.'); return; }
    if (!form?.sections?.length) { Alert.alert('Missing', 'Add at least one section.'); return; }
    const day = parseInt(form.feeBillingDay); const rem = parseInt(form.feeReminderDay);
    if (form.feeBillingDay && (isNaN(day) || day < 1 || day > 28)) { Alert.alert('Invalid', 'Fee billing day must be between 1 and 28.'); return; }
    if (form.feeReminderDay && (isNaN(rem) || rem < 1 || rem > 28)) { Alert.alert('Invalid', 'Fee reminder day must be between 1 and 28.'); return; }

    setSaving(true);
    try {
      // Full-object PUT: the endpoint overwrites these lists wholesale, so send
      // the complete current state, not a patch.
      const updated = await API.put(`/api/schools/${form._id}`, {
        ...form,
        feeBillingDay: form.feeBillingDay ? day : form.feeBillingDay,
        feeReminderDay: form.feeReminderDay ? rem : form.feeReminderDay,
      });
      setForm({ ...updated, classes: [...(updated.classes ?? [])], sections: [...(updated.sections ?? [])], workingDays: [...(updated.workingDays ?? [])] });
      await refreshSchool();
      Alert.alert('Saved', 'School setup updated. Class and section pickers across the app now use these lists.');
    } catch (e: any) { Alert.alert('Save failed', e.message); }
    finally { setSaving(false); }
  }

  // ── Leave types ─────────────────────────────────────────────────────────
  function openLeaveTypes() {
    setLtDraft((leaveTypes ?? []).map(t => ({ ...t, totalDays: String(t.totalDays ?? '') })));
    setLtOpen(true);
  }
  async function saveLeaveTypes() {
    const types = ltDraft
      .filter(t => (t.name ?? '').trim())
      .map(t => ({
        name: t.name.trim(),
        totalDays: parseFloat(t.totalDays) || 0,
        isPaid: t.isPaid !== false,
        color: t.color || undefined,
        description: t.description || undefined,
      }));
    if (!types.length) { Alert.alert('Missing', 'Add at least one leave type.'); return; }
    setSaving(true);
    try {
      await API.put('/api/payroll/leave-types', { types, requireApproval });
      const lt = await API.get('/api/payroll/leave-types');
      setLeaveTypes(lt.types ?? []);
      setLtOpen(false);
    } catch (e: any) { Alert.alert('Failed', e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <Screen title="School Setup" colors={rt.gradient} onBack={() => router.back()}><Loading /></Screen>;
  if (!form) return <Screen title="School Setup" colors={rt.gradient} onBack={() => router.back()}><EmptyState tint={moduleColor('school-setup')} icon="business" text="Could not load school details." /></Screen>;
  if (!editable) return <Screen title="School Setup" colors={rt.gradient} onBack={() => router.back()}><EmptyState tint={moduleColor('school-setup')} icon="lock-closed" text="You don't have permission to change school settings." /></Screen>;

  return (
    <Screen title="School Setup" subtitle="Master data used across the app" colors={rt.gradient} onBack={() => router.back()} scroll={false}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        <Collapsible title="School Profile" defaultOpen>
          <Field label="School name" value={form.name} onChangeText={(v: string) => set('name', v)} />
          <Field label="Email" value={form.email} autoCapitalize="none" onChangeText={(v: string) => set('email', v)} />
          <Field label="Phone" value={form.phone} keyboardType="phone-pad" onChangeText={(v: string) => set('phone', v)} />
          <Field label="City" value={form.city} onChangeText={(v: string) => set('city', v)} />
          <Field label="State" value={form.state} onChangeText={(v: string) => set('state', v)} />
          <Field label="Pincode" value={form.pincode} keyboardType="numeric" onChangeText={(v: string) => set('pincode', v)} />
          <AcademicYearPicker value={form.academicYear} currentYear={form.academicYear} onChange={(v) => set('academicYear', v)} />
        </Collapsible>

        <Collapsible title={`Classes (${form.classes?.length ?? 0})`} defaultOpen>
          <Text style={styles.hint}>Order matters — promotion moves students to the next class in this list.</Text>
          <ListEditor
            items={form.classes ?? []}
            placeholder="e.g. Nursery, 1, 2…"
            onAdd={(v) => addItem('classes', v)}
            onRemove={(i) => removeItem('classes', i)}
            onMove={(i, d) => moveItem('classes', i, d)}
            showReorder
          />
        </Collapsible>

        <Collapsible title={`Sections (${form.sections?.length ?? 0})`}>
          <ListEditor
            items={form.sections ?? []}
            placeholder="e.g. A, B, C…"
            onAdd={(v) => addItem('sections', v)}
            onRemove={(i) => removeItem('sections', i)}
          />
        </Collapsible>

        <Collapsible title="Working Days">
          <Text style={styles.hint}>Used by the timetable day picker.</Text>
          <View style={styles.dayRow}>
            {ALL_DAYS.map(d => {
              const on = (form.workingDays ?? []).includes(d);
              return (
                <TouchableOpacity key={d} onPress={() => toggleDay(d)} style={[styles.dayChip, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  <Text style={[styles.dayText, on && { color: '#fff' }]}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Collapsible>

        <Collapsible title="Fee Schedule">
          <Field label="Billing day of month (1-28)" value={form.feeBillingDay != null ? String(form.feeBillingDay) : ''} keyboardType="numeric" onChangeText={(v: string) => set('feeBillingDay', v)} />
          <Field label="Reminder day of month (1-28)" value={form.feeReminderDay != null ? String(form.feeReminderDay) : ''} keyboardType="numeric" onChangeText={(v: string) => set('feeReminderDay', v)} />
        </Collapsible>

        <Collapsible title={`Leave Types (${leaveTypes.length})`}>
          <Text style={styles.hint}>Used when staff apply for leave. Unpaid types drive payslip deductions.</Text>
          {leaveTypes.map((t, i) => (
            <View key={i} style={styles.ltRow}>
              <Text style={styles.ltName}>{t.name}</Text>
              <Text style={styles.ltMeta}>{t.totalDays} days · {t.isPaid !== false ? 'paid' : 'unpaid'}</Text>
            </View>
          ))}
          {leaveTypes.length === 0 && <Text style={styles.hint}>Using system defaults.</Text>}
          <TouchableOpacity style={styles.editBtn} onPress={openLeaveTypes}>
            <Ionicons name="create-outline" size={16} color={colors.primary} />
            <Text style={styles.editBtnText}>Edit leave types</Text>
          </TouchableOpacity>
        </Collapsible>

        <Text style={styles.footNote}>
          Subjects and grading scales are managed per class under Exams. Logo, colours and payment keys are configured on the web admin.
        </Text>
      </ScrollView>

      <View style={styles.saveBar}>
        <GradientButton label="Save School Setup" onPress={save} loading={saving} colors={rt.gradient} />
      </View>

      {/* Leave types editor */}
      <FormModal visible={ltOpen} title="Leave types" onClose={() => setLtOpen(false)}
        onSubmit={saveLeaveTypes} submitting={saving} submitLabel="Save leave types">
        <TouchableOpacity style={styles.checkRow} onPress={() => setRequireApproval(!requireApproval)}>
          <Ionicons name={requireApproval ? 'checkbox' : 'square-outline'} size={20} color={requireApproval ? colors.primary : colors.muted} />
          <Text style={styles.checkLabel}>Leave needs admin approval</Text>
        </TouchableOpacity>
        {ltDraft.map((t, i) => (
          <View key={i} style={styles.ltCard}>
            <View style={styles.ltHead}>
              <Text style={styles.ltIdx}>Type {i + 1}</Text>
              <TouchableOpacity onPress={() => setLtDraft(ltDraft.filter((_, j) => j !== i))}>
                <Ionicons name="close-circle" size={20} color={colors.danger} />
              </TouchableOpacity>
            </View>
            <Field label="Name" value={t.name} onChangeText={(v: string) => setLtDraft(ltDraft.map((x, j) => j === i ? { ...x, name: v } : x))} />
            <Field label="Days per year" value={t.totalDays} keyboardType="numeric" onChangeText={(v: string) => setLtDraft(ltDraft.map((x, j) => j === i ? { ...x, totalDays: v } : x))} />
            <TouchableOpacity style={styles.checkRow} onPress={() => setLtDraft(ltDraft.map((x, j) => j === i ? { ...x, isPaid: x.isPaid === false } : x))}>
              <Ionicons name={t.isPaid !== false ? 'checkbox' : 'square-outline'} size={20} color={t.isPaid !== false ? colors.primary : colors.muted} />
              <Text style={styles.checkLabel}>Paid leave</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={styles.addRow} onPress={() => setLtDraft([...ltDraft, { name: '', totalDays: '', isPaid: true }])}>
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.addText}>Add leave type</Text>
        </TouchableOpacity>
      </FormModal>
    </Screen>
  );
}

// Reusable add/remove/reorder list editor for simple string lists.
function ListEditor({ items, placeholder, onAdd, onRemove, onMove, showReorder }: {
  items: string[]; placeholder: string;
  onAdd: (v: string) => void; onRemove: (i: number) => void;
  onMove?: (i: number, dir: -1 | 1) => void; showReorder?: boolean;
}) {
  const [draft, setDraft] = useState('');
  return (
    <View style={{ gap: 6 }}>
      {items.map((it, i) => (
        <View key={`${it}-${i}`} style={styles.itemRow}>
          <Text style={styles.itemText}>{it}</Text>
          {showReorder && onMove && (
            <>
              <TouchableOpacity onPress={() => onMove(i, -1)} disabled={i === 0} style={[styles.iconBtn, i === 0 && { opacity: 0.3 }]}>
                <Ionicons name="chevron-up" size={16} color={colors.slate} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onMove(i, 1)} disabled={i === items.length - 1} style={[styles.iconBtn, i === items.length - 1 && { opacity: 0.3 }]}>
                <Ionicons name="chevron-down" size={16} color={colors.slate} />
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={() => onRemove(i)} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
          </TouchableOpacity>
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Field placeholder={placeholder} value={draft} onChangeText={setDraft} />
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => { onAdd(draft); setDraft(''); }}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { ...font.label, color: colors.muted, fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: spacing.sm },
  itemText: { ...font.body, color: colors.ink, flex: 1 },
  iconBtn: { padding: 4 },
  addBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  dayText: { ...font.label, color: colors.ink },
  ltRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  ltName: { ...font.body, color: colors.ink },
  ltMeta: { ...font.label, color: colors.muted },
  ltCard: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, gap: 4, marginTop: spacing.sm },
  ltHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ltIdx: { ...font.label, color: colors.slate, fontWeight: '700' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  checkLabel: { ...font.body, color: colors.ink },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  editBtnText: { ...font.label, color: colors.primary, fontWeight: '600' },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, marginTop: spacing.sm },
  addText: { ...font.label, color: colors.primary, fontWeight: '600' },
  footNote: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0, marginTop: spacing.lg, lineHeight: 18 },
  saveBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: colors.bg },
});