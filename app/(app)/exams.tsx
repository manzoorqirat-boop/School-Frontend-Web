import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSchoolConfig } from '@/lib/schoolConfig';
import { can } from '@/lib/privileges';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, ListItem, EmptyState, Loading, FormModal, Field, ChipPicker, DateField } from '@/components/screen';
import { toast, confirm } from '@/components/toast';

const TYPES = ['unit_test', 'periodic', 'term', 'half_yearly', 'annual', 'custom'];
const STATUS_TINT: Record<string, string> = { draft: colors.muted, published: colors.success };

export default function Exams() {
  const router = useRouter();
  const { user } = useAuth();
  const { classes, sectionsWithBlank } = useSchoolConfig();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);

  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<any>(null);
  const [results, setResults] = useState<any[] | null>(null);

  // create / edit
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [subjects, setSubjects] = useState<any[]>([]);   // master for chosen class
  const [chosen, setChosen] = useState<Record<string, { on: boolean; maxMarks: string }>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { const data = await API.get('/api/exams'); setExams(data.items ?? []); }
    catch (e: any) { toast.error('Error', e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── View + results + publish ────────────────────────────────────────────
  async function openView(exam: any) {
    setView(exam); setResults(null);
    try { const r = await API.get(`/api/exams/${exam._id}/results`); setResults(r.items ?? []); } catch {}
  }
  async function togglePublish(exam: any) {
    const publish = exam.status !== 'published';
    try {
      const updated = await API.post(`/api/exams/${exam._id}/${publish ? 'publish' : 'unpublish'}`);
      setExams(prev => prev.map(x => x._id === exam._id ? updated : x));
      setView(null);
    } catch (e: any) { toast.error('Failed', e.message); }
  }
  async function confirmDelete(exam: any) {
    const ok = await confirm({
      title: 'Delete exam',
      message: `Delete "${exam.name}" and all its results? This cannot be undone.`,
      confirmLabel: 'Delete', destructive: true,
    });
    if (!ok) return;
    try {
      await API.del(`/api/exams/${exam._id}`);
      setExams(prev => prev.filter(x => x._id !== exam._id));
      setView(null);
      toast.success('Exam deleted', `"${exam.name}" and its results were removed.`);
    } catch (e: any) { toast.error('Failed', e.message); }
  }

  // ── Create / edit ───────────────────────────────────────────────────────
  async function loadSubjects(cls: string) {
    try {
      const data = await API.get(`/api/exam-config/subjects?class=${encodeURIComponent(cls)}`);
      const items = data.items ?? [];
      setSubjects(items);
      // default: all on at 100 marks (create only)
      if (!editing) {
        const c: Record<string, any> = {};
        items.forEach((s: any) => { c[s._id] = { on: true, maxMarks: '100' }; });
        setChosen(c);
      }
    } catch { setSubjects([]); }
  }

  function openCreate() {
    setEditing(null);
    setForm({ class: '1', section: '', type: 'unit_test' });
    setChosen({});
    setFormOpen(true);
    loadSubjects('1');
  }
  function openEdit(exam: any) {
    setEditing(exam);
    setForm({
      name: exam.name, type: exam.type, class: exam.class, section: exam.section ?? '',
      fromDate: exam.fromDate ? String(exam.fromDate).slice(0, 10) : '',
      toDate: exam.toDate ? String(exam.toDate).slice(0, 10) : '',
      notes: exam.notes ?? '',
    });
    setView(null);
    setFormOpen(true);
  }

  const badDate = (v?: string) => v && !/^\d{4}-\d{2}-\d{2}$/.test(v);

  async function save() {
    if (!form.name?.trim()) { toast.error('Missing', 'Exam name is required.'); return; }
    if (badDate(form.fromDate) || badDate(form.toDate)) { toast.error('Invalid date', 'Dates must be YYYY-MM-DD.'); return; }
    if (form.fromDate && form.toDate && form.fromDate > form.toDate) { toast.error('Invalid', 'From date must be before To date.'); return; }

    setSaving(true);
    try {
      // Empty strings are not valid dates. Omit the key entirely rather than
      // sending '' — the API binds these to a nullable DateOnly, and '' fails
      // model binding with a 400 before the action ever runs.
      const d = (v?: string) => (v && v.trim() ? v.trim() : undefined);

      if (editing) {
        // PUT updates meta only — backend does not modify subjects on update.
        const updated = await API.put(`/api/exams/${editing._id}`, {
          name: form.name.trim(), type: form.type, section: form.section || null,
          fromDate: d(form.fromDate), toDate: d(form.toDate), notes: form.notes,
          weightInFinal: editing.weightInFinal ?? 0, gradingScaleId: editing.gradingScaleId ?? null,
        });
        setExams(prev => prev.map(x => x._id === editing._id ? updated : x));
      } else {
        const subs = subjects.filter(s => chosen[s._id]?.on).map(s => ({
          subjectId: s._id, subjectName: s.name,
          maxMarks: parseFloat(chosen[s._id].maxMarks) || 100,
        }));
        if (!subs.length) { toast.error('Missing', 'Select at least one subject.'); setSaving(false); return; }
        const created = await API.post('/api/exams', {
          name: form.name.trim(), type: form.type, class: form.class, section: form.section || null,
          fromDate: d(form.fromDate), toDate: d(form.toDate), notes: form.notes, subjects: subs,
          weightInFinal: 0,
        });
        setExams(prev => [created, ...prev]);
      }
      setFormOpen(false);
      toast.success(editing ? 'Exam updated' : 'Exam created', form.name?.trim());
    } catch (e: any) { toast.error('Save failed', e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <Screen title={t('nav.exams', 'Exams')} colors={rt.gradient} onBack={() => router.back()}><Loading /></Screen>;

  return (
    <Screen title={t('nav.exams', 'Exams')} subtitle={`${exams.length} exams`} colors={rt.gradient} onBack={() => router.back()} scroll={false}
      right={can(user, 'exam:create') ? (
        <TouchableOpacity onPress={openCreate} style={[styles.hBtn, { backgroundColor: moduleColor('exams'), borderColor: moduleColor('exams') }]}><Ionicons name="add" size={22} color="#fff" /></TouchableOpacity>
      ) : undefined}>
      <FlatList
        data={exams}
        keyExtractor={e => e._id}
        contentContainerStyle={{ padding: spacing.lg }}
        ListEmptyComponent={<EmptyState tint={moduleColor('exams')} icon="document-text" text="No exams yet. Use + to create one." />}
        renderItem={({ item: e }) => (
          <ListItem
            title={e.name}
            subtitle={`Class ${e.class}${e.section ? '-' + e.section : ''} · ${String(e.type).replace('_', ' ')} · ${(e.subjects ?? []).length} subjects`}
            badge={e.status ?? 'draft'} badgeTint={STATUS_TINT[e.status ?? 'draft']}
            onPress={() => openView(e)}
          />
        )}
      />

      {/* Detail + actions */}
      <FormModal visible={!!view} title={view?.name ?? ''} onClose={() => setView(null)}
        onSubmit={() => setView(null)} submitLabel="Close">
        {view && (
          <View style={{ gap: 6 }}>
            <Row k="Class" v={`${view.class}${view.section ? '-' + view.section : ' (all sections)'}`} />
            <Row k="Type" v={String(view.type).replace('_', ' ')} />
            <Row k="Dates" v={`${String(view.fromDate ?? '').slice(0,10)} → ${String(view.toDate ?? '').slice(0,10)}`} />
            <Row k="Subjects" v={(view.subjects ?? []).map((s: any) => `${s.subjectName} (${s.maxMarks})`).join(', ')} />
            <Row k="Status" v={view.status ?? 'draft'} />
            {results !== null && <Row k="Results entered" v={`${results.length}`} />}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
              {can(user, 'exam:publish') && (
                <ActBtn icon={view.status === 'published' ? 'eye-off-outline' : 'megaphone-outline'}
                  label={view.status === 'published' ? 'Unpublish' : 'Publish'} primary onPress={() => togglePublish(view)} />
              )}
              {can(user, 'exam:create') && <ActBtn icon="pencil-outline" label="Edit" onPress={() => openEdit(view)} />}
              {can(user, 'exam:create') && <ActBtn icon="trash-outline" label="Delete" danger onPress={() => confirmDelete(view)} />}
            </View>
          </View>
        )}
      </FormModal>

      {/* Create / edit */}
      <FormModal visible={formOpen} title={editing ? 'Edit exam' : 'New exam'} onClose={() => setFormOpen(false)}
        onSubmit={save} submitting={saving} submitLabel={editing ? 'Update' : 'Create'}>
        <Field label="Name *" value={form.name} placeholder="e.g. Unit Test 1" onChangeText={(v: string) => setForm({ ...form, name: v })} />
        <ChipPicker label="Type" options={TYPES} value={form.type ?? 'unit_test'} onChange={(v) => setForm({ ...form, type: v })} />
        {!editing && <ChipPicker label="Class *" options={classes} value={form.class ?? '1'} onChange={(v) => { setForm({ ...form, class: v }); loadSubjects(v); }} />}
        <ChipPicker label="Section (blank = all)" options={sectionsWithBlank} value={form.section ?? ''} onChange={(v) => setForm({ ...form, section: v })} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><DateField label="From *" value={form.fromDate} onChange={(v) => setForm({ ...form, fromDate: v })} /></View>
          <View style={{ flex: 1 }}><DateField label="To *" value={form.toDate} onChange={(v) => setForm({ ...form, toDate: v })} /></View>
        </View>

        {!editing && (
          <>
            <Text style={styles.subHead}>Subjects · tap to include, set max marks</Text>
            {subjects.length === 0 && <Text style={styles.hint}>No subjects configured for class {form.class}. Add them in web admin (Exam Config) first.</Text>}
            {subjects.map(s => {
              const c = chosen[s._id] ?? { on: false, maxMarks: '100' };
              return (
                <View key={s._id} style={styles.subRow}>
                  <TouchableOpacity onPress={() => setChosen({ ...chosen, [s._id]: { ...c, on: !c.on } })} style={styles.subToggle}>
                    <Ionicons name={c.on ? 'checkbox' : 'square-outline'} size={20} color={c.on ? colors.primary : colors.muted} />
                    <Text style={[styles.subName, !c.on && { color: colors.muted }]}>{s.name}</Text>
                  </TouchableOpacity>
                  {c.on && (
                    <View style={{ width: 90 }}>
                      <Field placeholder="Max" keyboardType="numeric" value={c.maxMarks}
                        onChangeText={(v: string) => setChosen({ ...chosen, [s._id]: { ...c, maxMarks: v } })} />
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}
        {editing && <Text style={styles.hint}>Subjects are fixed after creation. To change them, delete and recreate the exam.</Text>}
        <Field label="Notes" value={form.notes} onChangeText={(v: string) => setForm({ ...form, notes: v })} />
      </FormModal>
    </Screen>
  );
}

function Row({ k, v }: { k: string; v?: any }) {
  return <View style={styles.row}><Text style={styles.rowK}>{k}</Text><Text style={styles.rowV}>{v ?? '—'}</Text></View>;
}
function ActBtn({ icon, label, onPress, primary, danger }: any) {
  return (
    <TouchableOpacity onPress={onPress}
      style={[styles.actBtn, primary && { backgroundColor: colors.primary }, danger && { borderColor: colors.danger + '55' }]}>
      <Ionicons name={icon} size={15} color={primary ? '#fff' : danger ? colors.danger : colors.ink} />
      <Text style={[styles.actText, primary && { color: '#fff' }, danger && { color: colors.danger }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 12 },
  rowK: { ...font.label, color: colors.muted },
  rowV: { ...font.body, color: colors.ink, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.line },
  actText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  subHead: { ...font.title, color: colors.ink, marginTop: spacing.sm },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  subToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingVertical: 6 },
  subName: { ...font.body, color: colors.ink },
  hint: { ...font.label, color: colors.muted, fontStyle: 'italic' },
});
