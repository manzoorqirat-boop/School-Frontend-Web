import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSchoolConfig } from '@/lib/schoolConfig';
import { can } from '@/lib/privileges';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, ChipPicker, EmptyState, Loading, FormModal } from '@/components/screen';
import { GradientButton } from '@/components/ui';
import { toast } from '@/components/toast';


type Row = {
  id: string;
  fromClass: string; fromSection: string;
  toClass: string; toSection: string;
  count: number; graduate: boolean;
};

let _rid = 0;
const rid = () => `r${++_rid}`;

function nextClassOf(cls: string, order: string[]): string {
  const i = order.indexOf(cls);
  if (i === -1 || i === order.length - 1) return cls;   // unknown or terminal → keep
  return order[i + 1];
}
function ayList(school: any): string[] {
  const cur = new Date().getFullYear();
  const chosen = school?.academicYear || `${cur}-${cur + 1}`;
  const out: string[] = [];
  for (let y = cur - 1; y <= cur + 2; y++) out.push(`${y}-${y + 1}`);
  if (!out.includes(chosen)) out.unshift(chosen);
  return out;
}

export default function Promote() {
  const router = useRouter();
  const { user, school } = useAuth();
  const { classes, sections } = useSchoolConfig();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);
  const classOrder: string[] = classes;   // configured order drives promotion mapping
  const ays = ayList(school);

  const [fromAY, setFromAY] = useState<string>(school?.academicYear || ays[0] || '');
  const [toAY, setToAY] = useState<string>(() => {
    const cur = school?.academicYear || ays[0] || '';
    const m = cur.match(/^(\d{4})-(\d{4})$/);
    return m ? `${+m[1] + 1}-${+m[2] + 1}` : (ays[1] ?? '');
  });

  const [rows, setRows] = useState<Row[] | null>(null);
  const [building, setBuilding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isTerminal = (cls: string) => {
    const i = classOrder.indexOf(cls);
    return i !== -1 && i === classOrder.length - 1;
  };

  const build = useCallback(async () => {
    if (!fromAY || !toAY) { toast.error('Missing', 'Choose both academic years.'); return; }
    if (fromAY === toAY) { toast.error('Invalid', 'From and To academic years must differ.'); return; }
    setBuilding(true); setRows(null);
    try {
      const resp = await API.get('/api/students?limit=5000');
      const students: any[] = Array.isArray(resp) ? resp : resp.items || [];
      const inYear = students.filter(s => (s.academicYear || '') === fromAY && (s.status ?? 'active') === 'active');

      const groups = new Map<string, { cls: string; sec: string; count: number }>();
      inYear.forEach(s => {
        const cls = s.class || ''; const sec = s.section || '';
        if (!cls) return;
        const key = `${cls}::${sec}`;
        const g = groups.get(key) || { cls, sec, count: 0 };
        g.count += 1; groups.set(key, g);
      });

      if (groups.size === 0) { toast.warn('No students', `No active students found for ${fromAY}.`); setBuilding(false); return; }

      const ordered = [...groups.values()].sort((a, b) => {
        const ai = classOrder.indexOf(a.cls), bi = classOrder.indexOf(b.cls);
        if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        return a.sec.localeCompare(b.sec);
      });

      setRows(ordered.map(g => {
        const terminal = isTerminal(g.cls);
        return {
          id: rid(), fromClass: g.cls, fromSection: g.sec,
          toClass: terminal ? g.cls : nextClassOf(g.cls, classOrder),
          toSection: g.sec, count: g.count, graduate: terminal,
        };
      }));
    } catch (e: any) { toast.error('Error', e.message); }
    finally { setBuilding(false); }
  }, [fromAY, toAY, classOrder]);

  const totals = React.useMemo(() => {
    let promoteStudents = 0, graduateStudents = 0, promoteRows = 0, graduateRows = 0;
    (rows ?? []).forEach(r => {
      if (r.graduate) { graduateStudents += r.count; graduateRows++; }
      else { promoteStudents += r.count; promoteRows++; }
    });
    return { promoteStudents, graduateStudents, promoteRows, graduateRows, total: promoteStudents + graduateStudents };
  }, [rows]);

  function validate(): string | null {
    for (const r of rows ?? []) {
      if (!r.graduate && !r.toClass?.trim())
        return `${r.fromClass}-${r.fromSection}: choose a target class or mark it graduating.`;
    }
    return null;
  }

  async function submit() {
    const err = validate();
    if (err) { toast.error('Fix first', err); return; }
    setSaving(true);
    try {
      const promotions = (rows ?? []).filter(r => !r.graduate).map(r => ({
        fromClass: r.fromClass, fromSection: r.fromSection,
        toClass: r.toClass, toSection: r.toSection || r.fromSection,
      }));
      const graduatingClasses = [...new Set((rows ?? []).filter(r => r.graduate).map(r => r.fromClass))];

      const res = await API.post('/api/students/promote', {
        fromAcademicYear: fromAY, toAcademicYear: toAY, promotions, graduatingClasses,
      });
      setConfirmOpen(false);
      setRows(null);
      toast.success('Promotion complete', `${res.totalPromoted ?? 0} student(s) moved from ${fromAY} to ${toAY}.`);
    } catch (e: any) { toast.error('Promotion failed', e.message); }
    finally { setSaving(false); }
  }

  if (!can(user, 'student:update')) {
    return <Screen title="Promote" colors={rt.gradient} onBack={() => router.back()}>
      <EmptyState tint={moduleColor('promote')} icon="lock-closed" text="You don't have permission to promote students." />
    </Screen>;
  }

  return (
    <Screen title="Year-End Promotion" subtitle="Move students to the next class" colors={rt.gradient} onBack={() => router.back()} scroll={false}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        <View style={styles.ayCard}>
          <ChipPicker label="From academic year" options={ays} value={fromAY} onChange={(v) => { setFromAY(v); setRows(null); }} />
          <ChipPicker label="To academic year" options={ays} value={toAY} onChange={(v) => { setToAY(v); setRows(null); }} />
          <GradientButton label={rows ? 'Rebuild plan' : 'Build promotion plan'} onPress={build} loading={building} colors={rt.gradient} />
          <Text style={styles.hint}>Loads active students in the from-year, grouped by class &amp; section, and proposes next-class moves. Nothing changes until you confirm.</Text>
        </View>

        {building && <Loading />}

        {rows && rows.length > 0 && (
          <>
            <Text style={styles.sectHead}>{rows.length} groups · {totals.total} students</Text>
            {rows.map(r => (
              <TouchableOpacity key={r.id} style={styles.row} onPress={() => setEditRow({ ...r })} activeOpacity={0.8}>
                <View style={[styles.fromBadge, { backgroundColor: rt.accent + '18' }]}>
                  <Text style={[styles.fromText, { color: rt.accent }]}>{r.fromClass}-{r.fromSection}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={colors.muted} />
                {r.graduate ? (
                  <View style={styles.gradBadge}><Text style={styles.gradText}>Graduate</Text></View>
                ) : (
                  <View style={[styles.toBadge]}>
                    <Text style={styles.toText}>{r.toClass}-{r.toSection || r.fromSection}</Text>
                  </View>
                )}
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.count}>{r.count}</Text>
                  <Text style={styles.countLbl}>students</Text>
                </View>
              </TouchableOpacity>
            ))}

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLine}>↗︎ {totals.promoteStudents} students promoted across {totals.promoteRows} groups</Text>
              {totals.graduateRows > 0 && <Text style={styles.summaryLine}>🎓 {totals.graduateStudents} students graduating from {totals.graduateRows} groups</Text>}
            </View>
          </>
        )}

        {rows && rows.length === 0 && <EmptyState tint={moduleColor('promote')} icon="school" text="No groups to promote." />}
      </ScrollView>

      {rows && rows.length > 0 && (
        <View style={styles.saveBar}>
          <GradientButton label={`Review & promote ${totals.total} students`} onPress={() => setConfirmOpen(true)} colors={rt.gradient} />
        </View>
      )}

      {/* Per-row editor */}
      <FormModal visible={!!editRow} title={editRow ? `${editRow.fromClass}-${editRow.fromSection} (${editRow.count} students)` : ''}
        onClose={() => setEditRow(null)}
        onSubmit={() => { setRows(prev => (prev ?? []).map(r => r.id === editRow!.id ? editRow! : r)); setEditRow(null); }}
        submitLabel="Apply">
        {editRow && (
          <>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Graduate this group</Text>
              <TouchableOpacity onPress={() => setEditRow({ ...editRow, graduate: !editRow.graduate })}>
                <Ionicons name={editRow.graduate ? 'toggle' : 'toggle-outline'} size={34} color={editRow.graduate ? colors.primary : colors.muted} />
              </TouchableOpacity>
            </View>
            {!editRow.graduate && (
              <>
                <ChipPicker label="To class" options={classOrder} value={editRow.toClass} onChange={(v) => setEditRow({ ...editRow, toClass: v })} />
                <ChipPicker label="To section" options={sections} value={editRow.toSection || editRow.fromSection} onChange={(v) => setEditRow({ ...editRow, toSection: v })} />
              </>
            )}
            {editRow.graduate && <Text style={styles.hint}>These students will be marked graduated and moved to {toAY}.</Text>}
          </>
        )}
      </FormModal>

      {/* Confirm */}
      <FormModal visible={confirmOpen} title="Confirm promotion" onClose={() => setConfirmOpen(false)}
        onSubmit={submit} submitting={saving} submitLabel={`Promote ${totals.total} students`}>
        <Text style={styles.confirmText}>
          Moving <Text style={styles.bold}>{totals.total}</Text> active students from <Text style={styles.bold}>{fromAY}</Text> to <Text style={styles.bold}>{toAY}</Text>.
        </Text>
        <Text style={styles.confirmLine}>• {totals.promoteStudents} promoted to their next class</Text>
        {totals.graduateRows > 0 && <Text style={styles.confirmLine}>• {totals.graduateStudents} marked graduated</Text>}
        <Text style={[styles.hint, { marginTop: spacing.md }]}>This runs as a single transaction — either every group moves or none does. It can't be undone from the app, so double-check the plan.</Text>
      </FormModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  ayCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  hint: { ...font.label, color: colors.muted, fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 },
  sectHead: { ...font.caption, color: colors.muted, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.sm },
  fromBadge: { minWidth: 54, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  fromText: { ...font.title },
  toBadge: { minWidth: 54, height: 38, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  toText: { ...font.title, color: colors.ink },
  gradBadge: { height: 38, borderRadius: radius.sm, backgroundColor: colors.warning + '22', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  gradText: { ...font.label, color: colors.warning, fontWeight: '700' },
  count: { ...font.title, color: colors.ink },
  countLbl: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0 },
  summaryCard: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, gap: 4 },
  summaryLine: { ...font.body, color: colors.ink },
  saveBar: { padding: spacing.lg, backgroundColor: colors.bg,
    borderTopWidth: 1, borderTopColor: colors.line,
    // Was position:absolute/bottom:0 — anchored to the window, so on a tall
    // desktop viewport it fell outside the visible scroll area. Sticky keeps
    // it pinned to the bottom of the scroller on web; native stacks it inline.
    ...(Platform.OS === 'web' ? { position: 'sticky' as any, bottom: 0, zIndex: 10 } : null),
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs },
  toggleLabel: { ...font.title, color: colors.ink },
  confirmText: { ...font.body, color: colors.ink, marginBottom: spacing.sm },
  confirmLine: { ...font.body, color: colors.slate, marginBottom: 2 },
  bold: { fontWeight: '800', color: colors.ink },
});