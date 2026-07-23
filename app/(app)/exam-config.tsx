import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSchoolConfig } from '@/lib/schoolConfig';
import { can } from '@/lib/privileges';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, ChipPicker, EmptyState, Loading, Field, FormModal } from '@/components/screen';
import { Card, GradientButton } from '@/components/ui';
import { toast, confirm } from '@/components/toast';

// ─────────────────────────────────────────────────────────────────────────────
// Exam Config — subjects & grading scales
//
// The exams screen tells the user "Add them in web admin (Exam Config) first"
// when a class has no subjects, but that screen never existed: nothing in
// either app ever POSTed to /api/exam-config/subjects or /scales. The backend
// has had full CRUD for both all along, so exams could not be created for any
// class until someone inserted subject rows directly into the database.
//
// This screen closes that loop:
//   GET/POST/PUT/DELETE  /api/exam-config/subjects   (+ /subjects/bulk)
//   GET/POST/PUT/DELETE  /api/exam-config/scales
//
// Subjects are per class AND per academic year — a subject added for class 8
// in 2026-2027 does not appear for class 9, or for the next year. The class
// picker here mirrors the one on the exams screen so what you configure is
// exactly what the exam form will offer.
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'subjects' | 'scales';

// A sensible starting point so a new school isn't typing 10 rows by hand.
const COMMON_SUBJECTS = [
  'English', 'Hindi', 'Mathematics', 'Science', 'Social Science',
  'Computer Science', 'Sanskrit', 'Physical Education', 'Art', 'Music',
];
// Anything in here defaults to co-scholastic (graded, not counted toward %).
const CO_SCHOLASTIC = new Set(['Physical Education', 'Art', 'Music']);

export default function ExamConfig() {
  const router = useRouter();
  const { user } = useAuth();
  const { classes, academicYear } = useSchoolConfig();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);

  const editable = can(user, 'exam:create');
  const [tab, setTab] = useState<Tab>('subjects');

  return (
    <Screen title={t('nav.examConfig', 'Exam Config')}
      subtitle={editable ? 'Subjects & grading scales' : 'Read only'}
      colors={rt.gradient} onBack={() => router.back()} scroll={false}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <View style={styles.tabRow}>
          {([['subjects', 'Subjects', 'book-outline'], ['scales', 'Grading', 'ribbon-outline']] as const).map(([k, label, icon]) => {
            const on = tab === k;
            return (
              <TouchableOpacity key={k} onPress={() => setTab(k as Tab)}
                style={[styles.tab, on && { backgroundColor: rt.accent, borderColor: rt.accent }]}>
                <Ionicons name={icon as any} size={15} color={on ? '#fff' : colors.slate} />
                <Text style={[styles.tabText, on && { color: '#fff' }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {tab === 'subjects'
          ? <Subjects classes={classes} academicYear={academicYear} editable={editable} accent={rt.accent} />
          : <Scales editable={editable} accent={rt.accent} />}
      </ScrollView>
    </Screen>
  );
}

// ── Subjects ────────────────────────────────────────────────────────────────
function Subjects({ classes, academicYear, editable, accent }: {
  classes: string[]; academicYear?: string; editable: boolean; accent: string;
}) {
  const [cls, setCls] = useState(classes[0] ?? '1');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = `class=${encodeURIComponent(cls)}` + (academicYear ? `&academicYear=${encodeURIComponent(academicYear)}` : '');
      const data = await API.get(`/api/exam-config/subjects?${qs}`);
      setItems(data.items ?? []);
    } catch (e: any) { toast.error('Could not load subjects', e.message); }
    finally { setLoading(false); }
  }, [cls, academicYear]);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditing(null);
    setForm({
      name: '', code: '', defaultMaxMarks: '100',
      displayOrder: String(items.length + 1), isCoScholastic: false,
    });
    setOpen(true);
  }

  function openEdit(s: any) {
    setEditing(s);
    setForm({
      name: s.name ?? '', code: s.code ?? '',
      defaultMaxMarks: String(s.defaultMaxMarks ?? 100),
      displayOrder: String(s.displayOrder ?? 0),
      isCoScholastic: !!s.isCoScholastic,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name?.trim()) { toast.error('Missing', 'Subject name is required.'); return; }
    const marks = Number(form.defaultMaxMarks);
    if (!Number.isFinite(marks) || marks <= 0) { toast.error('Invalid', 'Max marks must be a positive number.'); return; }

    setSaving(true);
    try {
      const body: any = {
        name: form.name.trim(),
        code: form.code?.trim() ? form.code.trim().toUpperCase() : null,
        class: cls,
        academicYear: academicYear ?? '',
        isCoScholastic: !!form.isCoScholastic,
        defaultMaxMarks: marks,
        displayOrder: Number(form.displayOrder) || 0,
        isActive: true,
      };
      if (editing) {
        const updated = await API.put(`/api/exam-config/subjects/${editing._id}`, body);
        setItems(prev => prev.map(x => x._id === editing._id ? updated : x));
        toast.success('Subject updated', body.name);
      } else {
        const created = await API.post('/api/exam-config/subjects', body);
        setItems(prev => [...prev, created]);
        toast.success('Subject added', `${body.name} \u00b7 class ${cls}`);
      }
      setOpen(false);
    } catch (e: any) { toast.error('Save failed', e.message); }
    finally { setSaving(false); }
  }

  async function remove(s: any) {
    const ok = await confirm({
      title: 'Delete subject',
      message: `Remove "${s.name}" from class ${cls}? Exams already created keep their copy of the subject.`,
      confirmLabel: 'Delete', destructive: true,
    });
    if (!ok) return;
    try {
      await API.del(`/api/exam-config/subjects/${s._id}`);
      setItems(prev => prev.filter(x => x._id !== s._id));
      toast.success('Subject deleted', s.name);
    } catch (e: any) { toast.error('Delete failed', e.message); }
  }

  // Bulk-create the common set so a fresh school can get moving in one tap.
  async function seed() {
    const existing = new Set(items.map(x => String(x.name).toLowerCase()));
    const toAdd = COMMON_SUBJECTS.filter(n => !existing.has(n.toLowerCase()));
    if (toAdd.length === 0) { toast.info('Nothing to add', 'All common subjects already exist for this class.'); return; }

    const ok = await confirm({
      title: 'Add common subjects',
      message: `Add ${toAdd.length} subject(s) to class ${cls}: ${toAdd.join(', ')}. You can edit or delete any of them afterwards.`,
      confirmLabel: 'Add all',
    });
    if (!ok) return;

    setSeeding(true);
    try {
      await API.post('/api/exam-config/subjects/bulk', {
        subjects: toAdd.map((name, i) => ({
          name, code: null, class: cls, academicYear: academicYear ?? '',
          isCoScholastic: CO_SCHOLASTIC.has(name),
          defaultMaxMarks: CO_SCHOLASTIC.has(name) ? 50 : 100,
          displayOrder: items.length + i + 1, isActive: true,
        })),
      });
      toast.success('Subjects added', `${toAdd.length} added to class ${cls}.`);
      load();   // re-read so we get the server-assigned ids
    } catch (e: any) { toast.error('Bulk add failed', e.message); }
    finally { setSeeding(false); }
  }

  return (
    <>
      <Card>
        <Text style={styles.cardTitle}>Class</Text>
        <ChipPicker label="" options={classes} value={cls} onChange={setCls} />
        <Text style={styles.note}>
          Subjects are per class{academicYear ? ` and per year (${academicYear})` : ''}. The exam form
          offers exactly what is configured here.
        </Text>
      </Card>

      {loading ? <Loading /> : (
        <Card>
          <View style={styles.headRow}>
            <Text style={styles.cardTitle}>Subjects for class {cls} ({items.length})</Text>
            {editable && (
              <TouchableOpacity onPress={openNew} hitSlop={8}>
                <Ionicons name="add-circle" size={24} color={accent} />
              </TouchableOpacity>
            )}
          </View>

          {items.length === 0 ? (
            <>
              <EmptyState tint={moduleColor('exams')} icon="book"
                text={`No subjects for class ${cls} yet.`} />
              {editable && (
                <GradientButton label="Add common subjects" onPress={seed} loading={seeding}
                  colors={[accent, accent]} />
              )}
            </>
          ) : items.map(s => (
            <View key={s._id} style={styles.row}>
              <View style={[styles.order, { backgroundColor: accent + '18' }]}>
                <Text style={[styles.orderText, { color: accent }]}>{s.displayOrder ?? '-'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{s.name}</Text>
                <Text style={styles.sub}>
                  {s.code ? `${s.code} \u00b7 ` : ''}Max {s.defaultMaxMarks}
                  {s.isCoScholastic ? ' \u00b7 co-scholastic' : ''}
                  {s.isActive === false ? ' \u00b7 inactive' : ''}
                </Text>
              </View>
              {editable && (
                <>
                  <TouchableOpacity onPress={() => openEdit(s)} style={{ padding: 6 }}>
                    <Ionicons name="create-outline" size={18} color={colors.slate} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(s)} style={{ padding: 6 }}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          ))}
        </Card>
      )}

      <FormModal visible={open} title={editing ? 'Edit subject' : `Add subject \u00b7 class ${cls}`}
        onClose={() => setOpen(false)} onSubmit={save} submitting={saving}>
        <Field label="Name *" value={form.name} onChangeText={(v: string) => setForm({ ...form, name: v })}
          placeholder="Mathematics" />
        <Field label="Code" value={form.code} onChangeText={(v: string) => setForm({ ...form, code: v })}
          placeholder="MATH or 041" autoCapitalize="characters" />
        <Field label="Default max marks *" value={form.defaultMaxMarks} keyboardType="numeric"
          onChangeText={(v: string) => setForm({ ...form, defaultMaxMarks: v })} placeholder="100" />
        <Field label="Display order" value={form.displayOrder} keyboardType="numeric"
          onChangeText={(v: string) => setForm({ ...form, displayOrder: v })} placeholder="1" />
        <TouchableOpacity style={styles.check}
          onPress={() => setForm({ ...form, isCoScholastic: !form.isCoScholastic })}>
          <Ionicons name={form.isCoScholastic ? 'checkbox' : 'square-outline'} size={22}
            color={form.isCoScholastic ? colors.primary : colors.muted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.checkLabel}>Co-scholastic</Text>
            <Text style={styles.checkHint}>Graded only (A/B/C). Not counted toward percentage or rank.</Text>
          </View>
        </TouchableOpacity>
      </FormModal>
    </>
  );
}

// ── Grading scales ──────────────────────────────────────────────────────────
function Scales({ editable, accent }: { editable: boolean; accent: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [bands, setBands] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await API.get('/api/exam-config/scales');
      setItems(data.items ?? []);
    } catch (e: any) { toast.error('Could not load scales', e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditing(null);
    setForm({ name: '', type: 'marks', passingMark: '33', isDefault: false });
    // CBSE-style default ladder — edit or delete rows as needed.
    setBands([
      { grade: 'A1', minPercent: '91', maxPercent: '100' },
      { grade: 'A2', minPercent: '81', maxPercent: '90' },
      { grade: 'B1', minPercent: '71', maxPercent: '80' },
      { grade: 'B2', minPercent: '61', maxPercent: '70' },
      { grade: 'C1', minPercent: '51', maxPercent: '60' },
      { grade: 'C2', minPercent: '41', maxPercent: '50' },
      { grade: 'D',  minPercent: '33', maxPercent: '40' },
      { grade: 'E',  minPercent: '0',  maxPercent: '32' },
    ]);
    setOpen(true);
  }

  function openEdit(s: any) {
    setEditing(s);
    setForm({
      name: s.name ?? '', type: s.type ?? 'marks',
      passingMark: String(s.passingMark ?? 33), isDefault: !!s.isDefault,
    });
    setBands((s.bands ?? []).map((b: any) => ({
      grade: b.grade ?? '', minPercent: String(b.minPercent ?? 0), maxPercent: String(b.maxPercent ?? 0),
    })));
    setOpen(true);
  }

  function setBand(i: number, key: string, v: string) {
    setBands(prev => prev.map((b, k) => k === i ? { ...b, [key]: v } : b));
  }
  function addBand() { setBands(prev => [...prev, { grade: '', minPercent: '', maxPercent: '' }]); }
  function removeBand(i: number) { setBands(prev => prev.filter((_, k) => k !== i)); }

  async function save() {
    if (!form.name?.trim()) { toast.error('Missing', 'Scale name is required.'); return; }

    const clean = bands
      .filter(b => b.grade?.trim())
      .map(b => ({
        grade: b.grade.trim(),
        minPercent: Number(b.minPercent) || 0,
        maxPercent: Number(b.maxPercent) || 0,
      }));

    // Overlapping or inverted bands make gradeFor ambiguous, so catch it here
    // rather than discovering it on a printed report card.
    for (const b of clean) {
      if (b.minPercent > b.maxPercent) {
        toast.error('Invalid band', `${b.grade}: min (${b.minPercent}) is above max (${b.maxPercent}).`);
        return;
      }
    }
    const sorted = [...clean].sort((a, b) => a.minPercent - b.minPercent);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].minPercent <= sorted[i - 1].maxPercent) {
        toast.error('Bands overlap', `${sorted[i - 1].grade} and ${sorted[i].grade} cover the same percentage.`);
        return;
      }
    }

    setSaving(true);
    try {
      const body: any = {
        name: form.name.trim(),
        type: form.type,
        passingMark: Number(form.passingMark) || 0,
        isDefault: !!form.isDefault,
        isActive: true,
        bands: clean,
      };
      if (editing) {
        const updated = await API.put(`/api/exam-config/scales/${editing._id}`, body);
        setItems(prev => prev.map(x => x._id === editing._id ? updated : x));
        toast.success('Scale updated', body.name);
      } else {
        const created = await API.post('/api/exam-config/scales', body);
        setItems(prev => [...prev, created]);
        toast.success('Scale created', body.name);
      }
      setOpen(false);
    } catch (e: any) { toast.error('Save failed', e.message); }
    finally { setSaving(false); }
  }

  async function remove(s: any) {
    const ok = await confirm({
      title: 'Delete grading scale',
      message: `Remove "${s.name}"? Report cards using it will fall back to the default scale.`,
      confirmLabel: 'Delete', destructive: true,
    });
    if (!ok) return;
    try {
      await API.del(`/api/exam-config/scales/${s._id}`);
      setItems(prev => prev.filter(x => x._id !== s._id));
      toast.success('Scale deleted', s.name);
    } catch (e: any) { toast.error('Delete failed', e.message); }
  }

  return (
    <>
      {loading ? <Loading /> : (
        <Card>
          <View style={styles.headRow}>
            <Text style={styles.cardTitle}>Grading scales ({items.length})</Text>
            {editable && (
              <TouchableOpacity onPress={openNew} hitSlop={8}>
                <Ionicons name="add-circle" size={24} color={accent} />
              </TouchableOpacity>
            )}
          </View>

          {items.length === 0
            ? <EmptyState tint={moduleColor('exams')} icon="ribbon"
                text="No grading scales yet. Add one so report cards can show grades." />
            : items.map(s => (
              <View key={s._id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {s.name}{s.isDefault ? '  \u2605' : ''}
                  </Text>
                  <Text style={styles.sub}>
                    {String(s.type).replace('_', ' ')} \u00b7 pass {s.passingMark}% \u00b7 {(s.bands ?? []).length} band(s)
                  </Text>
                  {(s.bands ?? []).length > 0 && (
                    <Text style={styles.bandLine} numberOfLines={2}>
                      {[...(s.bands ?? [])]
                        .sort((a: any, b: any) => (b.minPercent ?? 0) - (a.minPercent ?? 0))
                        .map((b: any) => `${b.grade} ${b.minPercent}-${b.maxPercent}`)
                        .join('  \u00b7  ')}
                    </Text>
                  )}
                </View>
                {editable && (
                  <>
                    <TouchableOpacity onPress={() => openEdit(s)} style={{ padding: 6 }}>
                      <Ionicons name="create-outline" size={18} color={colors.slate} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => remove(s)} style={{ padding: 6 }}>
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ))}
        </Card>
      )}

      <FormModal visible={open} title={editing ? 'Edit grading scale' : 'New grading scale'}
        onClose={() => setOpen(false)} onSubmit={save} submitting={saving}>
        <Field label="Name *" value={form.name} onChangeText={(v: string) => setForm({ ...form, name: v })}
          placeholder="CBSE Scholastic" />
        <ChipPicker label="Type" options={['marks', 'grades', 'pass_fail']}
          value={form.type} onChange={(v) => setForm({ ...form, type: v })} />
        <Field label="Passing %" value={form.passingMark} keyboardType="numeric"
          onChangeText={(v: string) => setForm({ ...form, passingMark: v })} placeholder="33" />

        <TouchableOpacity style={styles.check} onPress={() => setForm({ ...form, isDefault: !form.isDefault })}>
          <Ionicons name={form.isDefault ? 'checkbox' : 'square-outline'} size={22}
            color={form.isDefault ? colors.primary : colors.muted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.checkLabel}>Default scale</Text>
            <Text style={styles.checkHint}>Used when an exam does not name a scale.</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.bandsTitle}>Grade bands</Text>
        <Text style={styles.checkHint}>Percentages are inclusive. Bands must not overlap.</Text>
        {bands.map((b, i) => (
          <View key={i} style={styles.bandRow}>
            <View style={{ flex: 1.1 }}>
              <Field label={i === 0 ? 'Grade' : ''} value={b.grade}
                onChangeText={(v: string) => setBand(i, 'grade', v)} placeholder="A1" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={i === 0 ? 'Min %' : ''} value={b.minPercent} keyboardType="numeric"
                onChangeText={(v: string) => setBand(i, 'minPercent', v)} placeholder="91" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={i === 0 ? 'Max %' : ''} value={b.maxPercent} keyboardType="numeric"
                onChangeText={(v: string) => setBand(i, 'maxPercent', v)} placeholder="100" />
            </View>
            <TouchableOpacity onPress={() => removeBand(i)} style={styles.bandDel}>
              <Ionicons name="close-circle" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity onPress={addBand} style={styles.addBand}>
          <Ionicons name="add" size={18} color={colors.primary} />
          <Text style={styles.addBandText}>Add band</Text>
        </TouchableOpacity>
      </FormModal>
    </>
  );
}

const styles = StyleSheet.create({
  tabRow: { flexDirection: 'row', gap: spacing.sm },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line },
  tabText: { ...font.label, color: colors.slate, fontWeight: '600' },

  cardTitle: { ...font.title, color: colors.ink, marginBottom: spacing.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  note: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0, marginTop: 4, lineHeight: 16 },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: colors.line },
  order: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  orderText: { ...font.label, fontWeight: '800' },
  name: { ...font.body, color: colors.ink, fontWeight: '600' },
  sub: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0, marginTop: 1 },
  bandLine: { ...font.caption, color: colors.slate, textTransform: 'none', letterSpacing: 0, marginTop: 3 },

  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, minHeight: 44 },
  checkLabel: { ...font.body, color: colors.ink, fontWeight: '600' },
  checkHint: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0, marginTop: 1, lineHeight: 16 },

  bandsTitle: { ...font.title, color: colors.ink, marginTop: spacing.md },
  bandRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-end' },
  bandDel: { paddingBottom: 14, paddingHorizontal: 2 },
  addBand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary,
    borderRadius: radius.md, marginTop: spacing.sm },
  addBandText: { ...font.label, color: colors.primary, fontWeight: '600' },
});
