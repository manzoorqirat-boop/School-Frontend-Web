import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSchoolConfig, localDate } from '@/lib/schoolConfig';
import { can } from '@/lib/privileges';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, ChipPicker, EmptyState, Loading, Field, FormModal, DateField, TimeField, AcademicYearPicker } from '@/components/screen';
import { GradientButton, Card } from '@/components/ui';
import { toast } from '@/components/toast';

// Backend contract: 0=Sun..6=Sat, so Mon=1..Sat=6.
const DAY_NUM: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

type Entry = {
  dayOfWeek: number; slotNumber: number;
  subjectName?: string;                       // entity field is subjectName (NOT subject)
  teacherId: string; teacherName?: string;    // teacherId is a hard FK — required
  room?: string; startTime?: string; endTime?: string; notes?: string;
};

export default function Timetable() {
  const router = useRouter();
  const { user, school } = useAuth();
  const { classes, sections, workingDays } = useSchoolConfig();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);
  const editable = can(user, 'timetable:manage');

  const [cls, setCls] = useState('1');
  const [sec, setSec] = useState('A');
  const [day, setDay] = useState('Mon');
  const [tt, setTt] = useState<any>(null);            // the timetable row (or null)
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [entryForm, setEntryForm] = useState<any>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<any>({});
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState<string[]>([]);
  // Entries live in local state until "Save Timetable" POSTs them. Without a
  // dirty flag the user gets no signal that an added/removed period isn't
  // persisted yet, which reads as "my timetable disappeared" after a reload.
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setEntries(null); setTt(null);
    try {
      const data = await API.get(`/api/timetables?class=${cls}&section=${sec}`);
      const row = (data.items ?? [])[0];
      setTt(row ?? null);
      setEntries(row?.entries ?? []);
      setDirty(false);
    } catch (e: any) { toast.error('Error', e.message); }
    finally { setLoading(false); }
  }, [cls, sec]);

  // The timetable used to load ONLY when the user pressed "Load", so after
  // creating one — or simply switching class/section — the screen showed
  // nothing and looked like the timetable had not been saved. Load on mount
  // and whenever class/section changes; `load` is already keyed to both.
  useEffect(() => { load(); }, [load]);

  async function loadTeachers() {
    if (teachers.length) return;
    try { const data = await API.get('/api/users?role=teacher&limit=100'); setTeachers(data.items ?? []); } catch {}
  }

  const dayEntries = (entries ?? [])
    .filter(e => e.dayOfWeek === DAY_NUM[day])
    .sort((a, b) => (a.slotNumber ?? 0) - (b.slotNumber ?? 0));

  // ── Create the timetable itself (when none exists) ──────────────────────
  function openCreateTimetable() {
    setCreateForm({ academicYear: '', fromDate: localDate() });
    setCreateOpen(true);
  }
  async function createTimetable() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(createForm.fromDate ?? '')) { toast.error('Invalid', 'From date must be YYYY-MM-DD.'); return; }
    setSaving(true);
    try {
      const created = await API.post('/api/timetables', {
        class: cls, section: sec,
        academicYear: createForm.academicYear || undefined,
        fromDate: createForm.fromDate, term: createForm.term || undefined,
      });
      setTt(created); setEntries(created.entries ?? []);
      setDirty(false);
      setCreateOpen(false);
      toast.success('Timetable created', `${cls}-${sec} — add periods, then Save.`);
    } catch (e: any) { toast.error('Failed', e.message); }
    finally { setSaving(false); }
  }

  // ── Entries ─────────────────────────────────────────────────────────────
  function openAdd() {
    loadTeachers();
    const nextSlot = (dayEntries.at(-1)?.slotNumber ?? 0) + 1;
    setEntryForm({ slotNumber: String(nextSlot), subjectName: '', teacherId: '', teacherName: '', room: '', startTime: '', endTime: '' });
    setFormOpen(true);
  }

  function addEntry() {
    if (!entryForm.subjectName?.trim()) { toast.error('Missing', 'Subject is required.'); return; }
    if (!entryForm.teacherId) { toast.error('Missing', 'Select a teacher — the backend requires one for every period.'); return; }
    const t2 = (v?: string) => v && !/^\d{2}:\d{2}$/.test(v) ? true : false;
    if (t2(entryForm.startTime) || t2(entryForm.endTime)) { toast.error('Invalid time', 'Times must be HH:MM (e.g. 09:00).'); return; }
    const e: Entry = {
      dayOfWeek: DAY_NUM[day], slotNumber: parseInt(entryForm.slotNumber) || (dayEntries.length + 1),
      subjectName: entryForm.subjectName.trim(),
      teacherId: entryForm.teacherId, teacherName: entryForm.teacherName,
      room: entryForm.room?.trim() || undefined,
      startTime: entryForm.startTime?.trim() || undefined, endTime: entryForm.endTime?.trim() || undefined,
    };
    setEntries([...(entries ?? []), e]);
    setDirty(true);
    setFormOpen(false);
  }

  function removeEntry(target: Entry) {
    setEntries((entries ?? []).filter(e => !(e.dayOfWeek === target.dayOfWeek && e.slotNumber === target.slotNumber)));
    setDirty(true);
  }

  // ── Copy one day's periods onto other days ──────────────────────────────
  function openCopy() {
    if (dayEntries.length === 0) {
      toast.error('Nothing to copy', `${day} has no periods yet.`);
      return;
    }
    setCopyTargets([]);
    setCopyOpen(true);
  }

  function toggleCopyTarget(d: string) {
    setCopyTargets(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  function applyCopy() {
    if (copyTargets.length === 0) { toast.error('Pick a day', 'Select at least one day to copy into.'); return; }
    // Replace the target days wholesale rather than appending, so copying twice
    // doesn't duplicate every period.
    const targetNums = copyTargets.map(d => DAY_NUM[d]);
    const kept = (entries ?? []).filter(e => !targetNums.includes(e.dayOfWeek));
    const copies: Entry[] = [];
    for (const tn of targetNums) {
      for (const e of dayEntries) copies.push({ ...e, dayOfWeek: tn });
    }
    setEntries([...kept, ...copies]);
    setDirty(true);
    setCopyOpen(false);
    toast.success('Copied', `${dayEntries.length} period(s) from ${day} → ${copyTargets.join(', ')}. Press Save to persist.`);
  }

  async function saveAll() {
    if (!tt) return;
    setSaving(true);
    try {
      const updated = await API.post(`/api/timetables/${tt._id}/entries`, { entries });
      setTt(updated); setEntries(updated.entries ?? entries);
      setDirty(false);
      toast.success('Saved', 'Timetable updated.');
    } catch (e: any) { toast.error('Save failed', e.message); }
    finally { setSaving(false); }
  }

  async function publish() {
    try {
      const updated = await API.post(`/api/timetables/${tt._id}/publish`);
      setTt(updated);
      toast.success('Published', 'This timetable is now active for students & parents.');
    } catch (e: any) { toast.error('Failed', e.message); }
  }

  const selTeacher = teachers.find(x => x._id === entryForm.teacherId);

  return (
    <Screen title={t('nav.timetable', 'Timetable')} subtitle={editable ? 'View & edit' : 'Class schedule'}
      colors={rt.gradient} onBack={() => router.back()} scroll={false}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 110 }}>
        <ChipPicker label="Class" options={classes} value={cls} onChange={setCls} />
        <ChipPicker label="Section" options={sections} value={sec} onChange={setSec} />
        <GradientButton label="Load" onPress={load} colors={rt.gradient} />

        {loading && <Loading />}

        {/* No timetable yet → offer inline creation instead of pointing at the web */}
        {!loading && entries !== null && !tt && (
          editable ? (
            <TouchableOpacity onPress={openCreateTimetable} style={[styles.addRow, { borderColor: rt.accent }]}>
              <Ionicons name="add-circle" size={22} color={rt.accent} />
              <Text style={[styles.addText, { color: rt.accent }]}>No timetable for {cls}-{sec} — create one</Text>
            </TouchableOpacity>
          ) : <EmptyState tint={moduleColor('timetable')} icon="calendar" text={`No timetable published for ${cls}-${sec} yet.`} />
        )}

        {tt && (
          <>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>{tt.academicYear || 'Current year'} · </Text>
              <Text style={[styles.metaBadge, { color: tt.status === 'active' ? colors.success : colors.warning }]}>
                {tt.status === 'active' ? 'Published' : 'Draft'}
              </Text>
              {editable && tt.status !== 'active' && (
                <TouchableOpacity onPress={publish} style={styles.pubBtn}>
                  <Text style={styles.pubText}>Publish</Text>
                </TouchableOpacity>
              )}
            </View>

            <ChipPicker label="Day" options={workingDays} value={day} onChange={setDay} />

            {editable && (
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
                <TouchableOpacity onPress={openAdd} style={[styles.addRow, { borderColor: rt.accent, flex: 1, marginBottom: 0 }]}>
                  <Ionicons name="add-circle" size={20} color={rt.accent} />
                  <Text style={[styles.addText, { color: rt.accent }]}>Add period</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={openCopy} style={[styles.addRow, { borderColor: colors.slate, flex: 1, marginBottom: 0 }]}>
                  <Ionicons name="copy-outline" size={20} color={colors.slate} />
                  <Text style={[styles.addText, { color: colors.slate }]}>Copy {day} →</Text>
                </TouchableOpacity>
              </View>
            )}

            {dayEntries.length === 0
              ? <EmptyState tint={moduleColor('timetable')} icon="calendar" text={`No periods on ${day}.`} />
              : dayEntries.map((e, i) => (
                <Card key={i} style={{ marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <View style={[styles.slot, { backgroundColor: rt.accent + '18' }]}>
                      <Text style={[styles.slotNum, { color: rt.accent }]}>{e.slotNumber ?? i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subject}>{e.subjectName ?? (e as any).subject ?? 'Period'}</Text>
                      <Text style={styles.teacher}>{e.teacherName ?? 'Unassigned'}{e.room ? ` \u00b7 Room ${e.room}` : ''}</Text>
                    </View>
                    {(e.startTime || e.endTime) ? <Text style={styles.time}>{e.startTime}{e.endTime ? `\u2013${e.endTime}` : ''}</Text> : null}
                    {editable && (
                      <TouchableOpacity onPress={() => removeEntry(e)} style={{ padding: 4 }}>
                        <Ionicons name="trash-outline" size={18} color={colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                </Card>
              ))
            }
          </>
        )}
      </ScrollView>

      {editable && tt && (
        <View style={styles.saveBar}>
          {dirty && (
            <View style={styles.dirtyRow}>
              <Ionicons name="alert-circle" size={15} color={colors.warning} />
              <Text style={styles.dirtyText}>Unsaved changes — press Save to persist.</Text>
            </View>
          )}
          <GradientButton label={dirty ? 'Save Timetable *' : 'Save Timetable'} onPress={saveAll} loading={saving} colors={rt.gradient} />
        </View>
      )}

      {/* Add period */}
      <FormModal visible={formOpen} title={`Add period \u00b7 ${day}`} onClose={() => setFormOpen(false)}
        onSubmit={addEntry} submitLabel="Add">
        <Field label="Slot / Period No" value={entryForm.slotNumber} keyboardType="numeric" onChangeText={(v: string) => setEntryForm({ ...entryForm, slotNumber: v })} />
        <Field label="Subject *" value={entryForm.subjectName} onChangeText={(v: string) => setEntryForm({ ...entryForm, subjectName: v })} />

        <Text style={styles.pickLabel}>Teacher * ({selTeacher ? selTeacher.name : 'tap to select'})</Text>
        {teachers.length === 0 && <Text style={styles.hint}>Loading teachers…</Text>}
        <View style={{ maxHeight: 160 }}>
          <ScrollView>
            {teachers.map(tc => {
              const on = entryForm.teacherId === tc._id;
              return (
                <TouchableOpacity key={tc._id} style={styles.teachRow}
                  onPress={() => setEntryForm({ ...entryForm, teacherId: tc._id, teacherName: tc.name })}>
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? colors.primary : colors.muted} />
                  <Text style={styles.teachName}>{tc.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <Field label="Room" value={entryForm.room} onChangeText={(v: string) => setEntryForm({ ...entryForm, room: v })} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><TimeField label="Start" value={entryForm.startTime} onChange={(v) => setEntryForm({ ...entryForm, startTime: v })} /></View>
          <View style={{ flex: 1 }}><TimeField label="End" value={entryForm.endTime} onChange={(v) => setEntryForm({ ...entryForm, endTime: v })} /></View>
        </View>
      </FormModal>

      {/* Copy day → other days */}
      <FormModal visible={copyOpen} title={`Copy ${day} \u00b7 ${dayEntries.length} period(s)`}
        onClose={() => setCopyOpen(false)} onSubmit={applyCopy} submitLabel="Copy">
        <Text style={styles.pickLabel}>Copy into which days?</Text>
        <Text style={styles.hint}>Selected days are replaced, not appended.</Text>
        {workingDays.filter(d => d !== day).map(d => {
          const on = copyTargets.includes(d);
          const existing = (entries ?? []).filter(e => e.dayOfWeek === DAY_NUM[d]).length;
          return (
            <TouchableOpacity key={d} style={styles.teachRow} onPress={() => toggleCopyTarget(d)}>
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.primary : colors.muted} />
              <Text style={styles.teachName}>{d}</Text>
              {existing > 0 && (
                <Text style={[styles.hint, { marginLeft: 'auto' }]}>
                  {existing} period(s) will be replaced
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </FormModal>

      {/* Create timetable */}
      <FormModal visible={createOpen} title={`New timetable \u00b7 ${cls}-${sec}`} onClose={() => setCreateOpen(false)}
        onSubmit={createTimetable} submitting={saving} submitLabel="Create">
        <AcademicYearPicker value={createForm.academicYear} currentYear={school?.academicYear} onChange={(v) => setCreateForm({ ...createForm, academicYear: v })} />
        <DateField label="From date *" value={createForm.fromDate} onChange={(v) => setCreateForm({ ...createForm, fromDate: v })} />
        <Field label="Term" value={createForm.term} placeholder="e.g. Term 1 (optional)" onChangeText={(v: string) => setCreateForm({ ...createForm, term: v })} />
      </FormModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  slot: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  slotNum: { ...font.h3 },
  subject: { ...font.title, color: colors.ink },
  teacher: { ...font.label, color: colors.muted, marginTop: 1 },
  time: { ...font.label, color: colors.slate },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 12,
    borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', marginBottom: spacing.sm },
  addText: { ...font.title },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...font.label, color: colors.slate },
  metaBadge: { ...font.label, fontWeight: '700' },
  pubBtn: { marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.primary },
  pubText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pickLabel: { ...font.label, color: colors.slate },
  teachRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  teachName: { ...font.body, color: colors.ink },
  hint: { ...font.label, color: colors.muted, fontStyle: 'italic' },
  dirtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  dirtyText: { ...font.caption, color: colors.warning, textTransform: 'none', letterSpacing: 0 },
  saveBar: { padding: spacing.lg, backgroundColor: colors.bg,
    borderTopWidth: 1, borderTopColor: colors.line,
    // Was position:absolute/bottom:0 — anchored to the window, so on a tall
    // desktop viewport it fell outside the visible scroll area. Sticky keeps
    // it pinned to the bottom of the scroller on web; native stacks it inline.
    ...(Platform.OS === 'web' ? { position: 'sticky' as any, bottom: 0, zIndex: 10 } : null),
  },
});
