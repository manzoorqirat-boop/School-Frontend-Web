import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { localDate as iso } from '@/lib/schoolConfig';
import { can } from '@/lib/privileges';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, Avatar, EmptyState, Loading, Field, FormModal, TimeField } from '@/components/screen';
import { GradientButton } from '@/components/ui';
import { toast } from '@/components/toast';

// Staff statuses differ from students — half-day, on-duty, paid vs unpaid leave.
const STATUSES = [
  { key: 'present',      label: 'P',  tint: colors.success },
  { key: 'absent',       label: 'A',  tint: colors.danger },
  { key: 'half_day',     label: '½',  tint: colors.warning },
  { key: 'leave',        label: 'Lv', tint: colors.info },
  { key: 'unpaid_leave', label: 'UL', tint: colors.slate },
  { key: 'on_duty',      label: 'OD', tint: colors.primary },
];
const LABELS: Record<string, string> = {
  present: 'Present', absent: 'Absent', half_day: 'Half day',
  leave: 'Leave (paid)', unpaid_leave: 'Unpaid leave', on_duty: 'On duty', holiday: 'Holiday',
};

const today = () => iso(new Date());

export default function TeacherAttendance() {
  const router = useRouter();
  const { user, school } = useAuth();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);
  const canMark = can(user, 'teacher_attendance:mark');

  const [date, setDate] = useState(today());
  const [roster, setRoster] = useState<any[] | null>(null);
  const [academicYear, setAcademicYear] = useState<string>('');
  const [lastMarked, setLastMarked] = useState<{ at?: string; by?: string }>({});
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, { remarks?: string; onDutyNote?: string; checkIn?: string; checkOut?: string }>>({});
  const [noteFor, setNoteFor] = useState<any>(null);
  const [noteForm, setNoteForm] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  function shiftDate(days: number) {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + days);
    if (iso(d) > today()) return;              // no future marking
    setDate(iso(d)); setRoster(null);
  }

  const loadRoster = useCallback(async () => {
    setLoading(true); setRoster(null);
    try {
      const data = await API.get(`/api/teacher-attendance/roster?date=${date}`);
      const rows = data.roster ?? [];
      setRoster(rows);
      setAcademicYear(data.academicYear ?? school?.academicYear ?? '');
      setLastMarked({ at: data.lastMarkedAt, by: data.lastMarkedBy });
      const im: Record<string, string> = {}; const ino: Record<string, any> = {};
      rows.forEach((r: any) => {
        im[r.teacher._id] = r.attendance?.status ?? 'present';
        if (r.attendance?.remarks || r.attendance?.onDutyNote || r.attendance?.checkIn || r.attendance?.checkOut)
          ino[r.teacher._id] = {
            remarks: r.attendance.remarks, onDutyNote: r.attendance.onDutyNote,
            checkIn: r.attendance.checkIn ? String(r.attendance.checkIn).slice(11, 16) : '',
            checkOut: r.attendance.checkOut ? String(r.attendance.checkOut).slice(11, 16) : '',
          };
      });
      setMarks(im); setNotes(ino);
    } catch (e: any) { toast.error('Error', e.message); }
    finally { setLoading(false); }
  }, [date, school?.academicYear]);

  function setAll(status: string) {
    if (!roster) return;
    const next: Record<string, string> = {};
    roster.forEach(r => { next[r.teacher._id] = status; });
    setMarks(next);
  }

  function openNote(r: any) { setNoteFor(r); setNoteForm(notes[r.teacher._id] ?? {}); }
  function saveNote() {
    setNotes({ ...notes, [noteFor.teacher._id]: { ...noteForm } });
    setNoteFor(null);
  }

  // Combine the roster date with an HH:MM into an ISO timestamp for check-in/out.
  function toIsoTime(hhmm?: string): string | undefined {
    if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return undefined;
    return `${date}T${hhmm}:00`;
  }

  async function save() {
    if (!roster?.length || !canMark) return;
    setSaving(true);
    try {
      const entries = roster.map(r => {
        const id = r.teacher._id;
        const n = notes[id] ?? {};
        return {
          teacherId: id, status: marks[id] ?? 'present',
          checkIn: toIsoTime(n.checkIn), checkOut: toIsoTime(n.checkOut),
          onDutyNote: n.onDutyNote || undefined, remarks: n.remarks || undefined,
        };
      });
      const res = await API.post('/api/teacher-attendance/mark-bulk', {
        date, academicYear: academicYear || undefined, entries,
      });
      const errCount = (res.errors ?? []).length;
      toast.show(errCount ? 'warn' : 'success', errCount ? 'Saved with issues' : 'Saved', `${res.created ?? 0} new · ${res.updated ?? 0} updated · ${res.unchanged ?? 0} unchanged${errCount ? `\n${errCount} failed` : ''}`);
      setLastMarked({ at: new Date().toISOString(), by: user?.name });
    } catch (e: any) { toast.error('Save failed', e.message); }
    finally { setSaving(false); }
  }

  const isToday = date === today();

  return (
    <Screen title="Staff Attendance" subtitle={canMark ? 'Mark & correct' : 'View only'}
      colors={rt.gradient} onBack={() => router.back()} scroll={false}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
        <View style={styles.dateRow}>
          <TouchableOpacity onPress={() => shiftDate(-1)} style={styles.dateBtn}><Ionicons name="chevron-back" size={18} color={colors.ink} /></TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.dateText}>{isToday ? 'Today' : date}</Text>
            {!isToday && <Text style={styles.dateSub}>{date}</Text>}
          </View>
          <TouchableOpacity onPress={() => shiftDate(1)} disabled={isToday} style={[styles.dateBtn, isToday && { opacity: 0.3 }]}>
            <Ionicons name="chevron-forward" size={18} color={colors.ink} />
          </TouchableOpacity>
        </View>
        <GradientButton label="Load Staff Roster" onPress={loadRoster} colors={rt.gradient} />
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
              <Text style={styles.bulkLabel}>All:</Text>
              {STATUSES.map(s => (
                <TouchableOpacity key={s.key} onPress={() => setAll(s.key)} style={[styles.bulkChip, { borderColor: s.tint }]}>
                  <Text style={[styles.bulkChipText, { color: s.tint }]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <FlatList
            data={roster}
            keyExtractor={r => r.teacher._id}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
            ListEmptyComponent={<EmptyState tint={moduleColor('staff-attendance')} icon="people" text="No active teachers." />}
            renderItem={({ item: r }) => {
              const id = r.teacher._id;
              const n = notes[id];
              const hasNote = !!(n?.remarks || n?.onDutyNote || n?.checkIn || n?.checkOut);
              return (
                <View style={styles.row}>
                  <Avatar name={r.teacher.name} tint={rt.accent} size={38} />
                  <TouchableOpacity style={{ flex: 1 }} onLongPress={canMark ? () => openNote(r) : undefined}>
                    <Text style={styles.name}>{r.teacher.name}</Text>
                    <Text style={styles.sub}>
                      {LABELS[marks[id]] ?? 'Present'}{n?.checkIn ? ` · ${n.checkIn}${n.checkOut ? `–${n.checkOut}` : ''}` : ''}{hasNote ? ' · 📝' : ''}
                    </Text>
                  </TouchableOpacity>
                  {canMark && (
                    <TouchableOpacity onPress={() => openNote(r)} style={{ padding: 4 }} hitSlop={6}>
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

      <FormModal visible={!!noteFor} title={noteFor ? noteFor.teacher.name : ''}
        onClose={() => setNoteFor(null)} onSubmit={saveNote} submitLabel="Save">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><TimeField label="Check-in" value={noteForm.checkIn} onChange={(v) => setNoteForm({ ...noteForm, checkIn: v })} /></View>
          <View style={{ flex: 1 }}><TimeField label="Check-out" value={noteForm.checkOut} onChange={(v) => setNoteForm({ ...noteForm, checkOut: v })} /></View>
        </View>
        <Field label="On-duty note" value={noteForm.onDutyNote} placeholder="e.g. Exam duty at DAV" onChangeText={(v: string) => setNoteForm({ ...noteForm, onDutyNote: v })} />
        <Field label="Remarks" value={noteForm.remarks} onChangeText={(v: string) => setNoteForm({ ...noteForm, remarks: v })} />
      </FormModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.xs },
  dateBtn: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  dateText: { ...font.title, color: colors.ink },
  dateSub: { ...font.caption, color: colors.muted },
  lastMarked: { ...font.caption, color: colors.muted, paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  bulkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, flexWrap: 'wrap' },
  bulkLabel: { ...font.label, color: colors.slate },
  bulkChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1.5 },
  bulkChipText: { ...font.caption },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.sm },
  name: { ...font.title, color: colors.ink },
  sub: { ...font.label, color: colors.muted, marginTop: 1 },
  statusRow: { flexDirection: 'row', gap: 3, flexWrap: 'wrap', maxWidth: 132, justifyContent: 'flex-end' },
  sBtn: { width: 30, height: 30, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  sBtnText: { ...font.label, color: colors.slate, fontWeight: '800' },
  saveBar: { padding: spacing.lg, backgroundColor: colors.bg,
    borderTopWidth: 1, borderTopColor: colors.line,
    // Was position:absolute/bottom:0 — anchored to the window, so on a tall
    // desktop viewport it fell outside the visible scroll area. Sticky keeps
    // it pinned to the bottom of the scroller on web; native stacks it inline.
    ...(Platform.OS === 'web' ? { position: 'sticky' as any, bottom: 0, zIndex: 10 } : null),
  },
});