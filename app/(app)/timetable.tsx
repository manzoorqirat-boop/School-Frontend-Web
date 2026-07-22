import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, TouchableOpacity, Platform } from 'react-native';
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

  const load = useCallback(async () => {
    setLoading(true); setEntries(null); setTt(null);
    try {
      const data = await API.get(`/api/timetables?class=${cls}&section=${sec}`);
      const row = (data.items ?? [])[0];
      setTt(row ?? null);
      setEntries(row?.entries ?? []);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }, [cls, sec]);

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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(createForm.fromDate ?? '')) { Alert.alert('Invalid', 'From date must be YYYY-MM-DD.'); return; }
    setSaving(true);
    try {
      const created = await API.post('/api/timetables', {
        class: cls, section: sec,
        academicYear: createForm.academicYear || undefined,
        fromDate: createForm.fromDate, term: createForm.term || undefined,
      });
      setTt(created); setEntries(created.entries ?? []);
      setCreateOpen(false);
    } catch (e: any) { Alert.alert('Failed', e.message); }
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
    if (!entryForm.subjectName?.trim()) { Alert.alert('Missing', 'Subject is required.'); return; }
    if (!entryForm.teacherId) { Alert.alert('Missing', 'Select a teacher — the backend requires one for every period.'); return; }
    const t2 = (v?: string) => v && !/^\d{2}:\d{2}$/.test(v) ? true : false;
    if (t2(entryForm.startTime) || t2(entryForm.endTime)) { Alert.alert('Invalid time', 'Times must be HH:MM (e.g. 09:00).'); return; }
    const e: Entry = {
      dayOfWeek: DAY_NUM[day], slotNumber: parseInt(entryForm.slotNumber) || (dayEntries.length + 1),
      subjectName: entryForm.subjectName.trim(),
      teacherId: entryForm.teacherId, teacherName: entryForm.teacherName,
      room: entryForm.room?.trim() || undefined,
      startTime: entryForm.startTime?.trim() || undefined, endTime: entryForm.endTime?.trim() || undefined,
    };
    setEntries([...(entries ?? []), e]);
    setFormOpen(false);
  }

  function removeEntry(target: Entry) {
    setEntries((entries ?? []).filter(e => !(e.dayOfWeek === target.dayOfWeek && e.slotNumber === target.slotNumber)));
  }

  async function saveAll() {
    if (!tt) return;
    setSaving(true);
    try {
      const updated = await API.post(`/api/timetables/${tt._id}/entries`, { entries });
      setTt(updated); setEntries(updated.entries ?? entries);
      Alert.alert('Saved', 'Timetable updated.');
    } catch (e: any) { Alert.alert('Save failed', e.message); }
    finally { setSaving(false); }
  }

  async function publish() {
    try {
      const updated = await API.post(`/api/timetables/${tt._id}/publish`);
      setTt(updated);
      Alert.alert('Published', 'This timetable is now active for students & parents.');
    } catch (e: any) { Alert.alert('Failed', e.message); }
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
              <TouchableOpacity onPress={openAdd} style={[styles.addRow, { borderColor: rt.accent }]}>
                <Ionicons name="add-circle" size={22} color={rt.accent} />
                <Text style={[styles.addText, { color: rt.accent }]}>Add period to {day}</Text>
              </TouchableOpacity>
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
          <GradientButton label="Save Timetable" onPress={saveAll} loading={saving} colors={rt.gradient} />
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
  saveBar: { padding: spacing.lg, backgroundColor: colors.bg,
    borderTopWidth: 1, borderTopColor: colors.line,
    // Was position:absolute/bottom:0 — anchored to the window, so on a tall
    // desktop viewport it fell outside the visible scroll area. Sticky keeps
    // it pinned to the bottom of the scroller on web; native stacks it inline.
    ...(Platform.OS === 'web' ? { position: 'sticky' as any, bottom: 0, zIndex: 10 } : null),
  },
});
