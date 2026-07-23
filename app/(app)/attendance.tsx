import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSchoolConfig, localDate as iso } from '@/lib/schoolConfig';
import { can } from '@/lib/privileges';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, ChipPicker, Avatar, EmptyState, Loading, Field, FormModal } from '@/components/screen';
import { GradientButton } from '@/components/ui';
import { toast } from '@/components/toast';

const PERIODS = ['1','2','3','4','5','6','7','8'];
const STATUSES = [
  { key: 'present', label: 'P', tint: colors.success },
  { key: 'absent',  label: 'A', tint: colors.danger },
  { key: 'late',    label: 'L', tint: colors.warning },
  { key: 'leave',   label: 'Lv', tint: colors.info },
];

const today = () => iso(new Date());

export default function Attendance() {
  const router = useRouter();
  const { user } = useAuth();
  const { classes, sections } = useSchoolConfig();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);
  const canMark = can(user, 'attendance:mark');

  const [cls, setCls] = useState('1');
  const [sec, setSec] = useState('A');
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState<'daily' | 'period'>('daily');
  const [period, setPeriod] = useState('1');
  const [subject, setSubject] = useState('');

  const [roster, setRoster] = useState<any[] | null>(null);
  const [lastMarked, setLastMarked] = useState<{ at?: string; by?: string }>({});
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, { remarks?: string; leaveReason?: string }>>({});
  const [noteFor, setNoteFor] = useState<any>(null);
  const [noteForm, setNoteForm] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  function shiftDate(days: number) {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + days);
    if (iso(d) > today()) return;               // no future marking
    setDate(iso(d));
    setRoster(null);                            // stale roster for old date
  }

  const loadRoster = useCallback(async () => {
    setLoading(true); setRoster(null);
    try {
      let url = `/api/attendance/roster?class=${cls}&section=${sec}&date=${date}&mode=${mode}`;
      if (mode === 'period') {
        url += `&period=${period}`;
        if (subject.trim()) url += `&subject=${encodeURIComponent(subject.trim())}`;
      }
      const data = await API.get(url);
      const rows = data.roster ?? [];
      setRoster(rows);
      setLastMarked({ at: data.lastMarkedAt, by: data.lastMarkedBy });
      const initial: Record<string, string> = {};
      const initialNotes: Record<string, any> = {};
      rows.forEach((r: any) => {
        initial[r.student._id] = r.attendance?.status ?? 'present';
        if (r.attendance?.remarks || r.attendance?.leaveReason)
          initialNotes[r.student._id] = { remarks: r.attendance.remarks, leaveReason: r.attendance.leaveReason };
      });
      setMarks(initial);
      setNotes(initialNotes);
    } catch (e: any) { toast.error('Error', e.message); }
    finally { setLoading(false); }
  }, [cls, sec, date, mode, period, subject]);

  async function save() {
    if (!roster?.length || !canMark) return;
    setSaving(true);
    try {
      const entries = roster.map(r => ({
        studentId: r.student._id,
        status: marks[r.student._id] ?? 'present',
        remarks: notes[r.student._id]?.remarks || undefined,
        leaveReason: notes[r.student._id]?.leaveReason || undefined,
      }));
      const body: any = { class: cls, section: sec, date, mode, entries };
      if (mode === 'period') { body.period = parseInt(period); if (subject.trim()) body.subject = subject.trim(); }
      const res = await API.post('/api/attendance/mark-bulk', body);
      const errCount = (res.errors ?? []).length;
      toast.show(errCount ? 'warn' : 'success', errCount ? 'Saved with issues' : 'Saved', `${res.created ?? 0} new · ${res.updated ?? 0} updated · ${res.unchanged ?? 0} unchanged${errCount ? `\n${errCount} entr${errCount === 1 ? 'y' : 'ies'} failed` : ''}`);
      setLastMarked({ at: new Date().toISOString(), by: user?.name });
    } catch (e: any) { toast.error('Save failed', e.message); }
    finally { setSaving(false); }
  }

  function setAll(status: string) {
    if (!roster) return;
    const next: Record<string, string> = {};
    roster.forEach(r => { next[r.student._id] = status; });
    setMarks(next);
  }

  function openNote(r: any) {
    setNoteFor(r);
    setNoteForm(notes[r.student._id] ?? {});
  }
  function saveNote() {
    setNotes({ ...notes, [noteFor.student._id]: { remarks: noteForm.remarks, leaveReason: noteForm.leaveReason } });
    setNoteFor(null);
  }

  const isToday = date === today();

  return (
    <Screen title={t('nav.attendance', 'Attendance')}
      subtitle={canMark ? 'Mark & correct' : 'View only'}
      colors={rt.gradient} onBack={() => router.back()} scroll={false}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
        {/* Date navigator */}
        <View style={styles.dateRow}>
          <TouchableOpacity onPress={() => shiftDate(-1)} style={styles.dateBtn}>
            <Ionicons name="chevron-back" size={18} color={colors.ink} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.dateText}>{isToday ? 'Today' : date}</Text>
            {!isToday && <Text style={styles.dateSub}>{date}</Text>}
          </View>
          <TouchableOpacity onPress={() => shiftDate(1)} disabled={isToday}
            style={[styles.dateBtn, isToday && { opacity: 0.3 }]}>
            <Ionicons name="chevron-forward" size={18} color={colors.ink} />
          </TouchableOpacity>
        </View>

        <ChipPicker label="Class" options={classes} value={cls} onChange={(v) => { setCls(v); setRoster(null); }} />
        <ChipPicker label="Section" options={sections} value={sec} onChange={(v) => { setSec(v); setRoster(null); }} />
        <ChipPicker label="Mode" options={['daily', 'period']} value={mode} onChange={(v) => { setMode(v as any); setRoster(null); }} />
        {mode === 'period' && (
          <>
            <ChipPicker label="Period" options={PERIODS} value={period} onChange={(v) => { setPeriod(v); setRoster(null); }} />
            <Field label="Subject (optional)" value={subject} onChangeText={setSubject} placeholder="e.g. Maths" />
          </>
        )}
        <GradientButton label="Load Roster" onPress={loadRoster} colors={rt.gradient} />
      </View>

      {loading && <Loading />}

      {roster && (
        <>
          {lastMarked.at && (
            <Text style={styles.lastMarked}>
              Last marked{lastMarked.by ? ` by ${lastMarked.by}` : ''} · {new Date(lastMarked.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
          {canMark && (
            <View style={styles.bulkRow}>
              <Text style={styles.bulkLabel}>Mark all:</Text>
              {STATUSES.map(s => (
                <TouchableOpacity key={s.key} onPress={() => setAll(s.key)} style={[styles.bulkChip, { borderColor: s.tint }]}>
                  <Text style={[styles.bulkChipText, { color: s.tint }]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <FlatList
            data={roster}
            keyExtractor={r => r.student._id}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
            ListEmptyComponent={<EmptyState tint={moduleColor('attendance')} icon="people" text="No active students in this class." />}
            renderItem={({ item: r }) => {
              const id = r.student._id;
              const hasNote = !!(notes[id]?.remarks || notes[id]?.leaveReason);
              return (
                <View style={styles.row}>
                  <Avatar name={`${r.student.firstName} ${r.student.lastName ?? ''}`} tint={rt.accent} size={38} />
                  <TouchableOpacity style={{ flex: 1 }} onLongPress={canMark ? () => openNote(r) : undefined}>
                    <Text style={styles.name}>{r.student.firstName} {r.student.lastName ?? ''}</Text>
                    <Text style={styles.roll}>Roll {r.student.rollNo ?? '—'}{hasNote ? ' · 📝' : ''}</Text>
                  </TouchableOpacity>
                  {canMark && (
                    <TouchableOpacity onPress={() => openNote(r)} style={styles.noteBtn} hitSlop={6}>
                      <Ionicons name={hasNote ? 'document-text' : 'document-text-outline'} size={16} color={hasNote ? colors.primary : colors.muted} />
                    </TouchableOpacity>
                  )}
                  <View style={styles.statusRow}>
                    {STATUSES.map(s => {
                      const on = marks[id] === s.key;
                      return (
                        <TouchableOpacity key={s.key} disabled={!canMark}
                          onPress={() => setMarks({ ...marks, [id]: s.key })}
                          style={[styles.sBtn, on && { backgroundColor: s.tint }]}>
                          <Text style={[styles.sBtnText, on && { color: '#fff' }]}>{s.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            }}
          />
          {canMark && (
            <View style={styles.saveBar}>
              <GradientButton label={isToday ? 'Save Attendance' : `Save for ${date}`} onPress={save} loading={saving} colors={rt.gradient} />
            </View>
          )}
        </>
      )}

      {/* Per-student note */}
      <FormModal visible={!!noteFor} title={noteFor ? `Note · ${noteFor.student.firstName}` : ''}
        onClose={() => setNoteFor(null)} onSubmit={saveNote} submitLabel="Save note">
        <Field label="Remarks" value={noteForm.remarks} onChangeText={(v: string) => setNoteForm({ ...noteForm, remarks: v })} placeholder="e.g. Arrived 20 min late" />
        <Field label="Leave reason" value={noteForm.leaveReason} onChangeText={(v: string) => setNoteForm({ ...noteForm, leaveReason: v })} placeholder="e.g. Medical" />
      </FormModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.xs },
  dateBtn: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  dateText: { ...font.title, color: colors.ink },
  dateSub: { ...font.caption, color: colors.muted },
  lastMarked: { ...font.caption, color: colors.muted, paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  bulkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  bulkLabel: { ...font.label, color: colors.slate },
  bulkChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1.5 },
  bulkChipText: { ...font.caption },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.sm },
  name: { ...font.title, color: colors.ink },
  roll: { ...font.label, color: colors.muted },
  noteBtn: { padding: 4 },
  statusRow: { flexDirection: 'row', gap: 4 },
  sBtn: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center' },
  sBtnText: { ...font.label, color: colors.slate, fontWeight: '800' },
  saveBar: { padding: spacing.lg, backgroundColor: colors.bg,
    borderTopWidth: 1, borderTopColor: colors.line,
    // Was position:absolute/bottom:0 — anchored to the window, so on a tall
    // desktop viewport it fell outside the visible scroll area. Sticky keeps
    // it pinned to the bottom of the scroller on web; native stacks it inline.
    ...(Platform.OS === 'web' ? { position: 'sticky' as any, bottom: 0, zIndex: 10 } : null),
  },
});