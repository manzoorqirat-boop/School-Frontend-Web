import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, EmptyState, Loading } from '@/components/screen';
import { Card } from '@/components/ui';
import { exportCSV, exportHTML, htmlTable } from '@/lib/export';
import { toast } from '@/components/toast';

// ─────────────────────────────────────────────────────────────────────────────
// Exam results & analytics
//
// GET /api/exams/{id}/results returns the full analytics package again (rank,
// division bands, subject toppers, class topper, aggregate stats). Nothing
// rendered it — the exams screen showed a single "Results entered: N" row, so
// the entire analysis was invisible.
//
// This is a full screen rather than a modal section because the ranked matrix
// is students × subjects: it needs horizontal room and its own scroll.
//
// Reference behaviour taken from the Next.js exams page, which had this all
// along: KPI row, division distribution, topper cards, ranked table, export.
// ─────────────────────────────────────────────────────────────────────────────

const DIV_TINT: Record<string, string> = {
  First: colors.emerald,
  Second: colors.sky,
  Third: colors.amber,
  Fail: colors.danger,
};

const num = (v: any) => Number(v ?? 0);

function pctTint(p: number) {
  if (p >= 75) return colors.emerald;
  if (p >= 50) return colors.amber;
  if (p >= 33) return colors.warning;
  return colors.danger;
}

export default function ExamResults() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { user } = useAuth();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setData(await API.get(`/api/exams/${id}/results`));
    } catch (e: any) {
      toast.error('Could not load results', e.message);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const rows: any[] = data?.rows ?? [];
  const subjects: any[] = data?.subjects ?? [];
  const stats = data?.stats ?? {};
  const toppers: any[] = (data?.subjectToppers ?? []).filter((x: any) => x.topper);
  const classTopper = data?.classTopper;

  // Unranked students (incomplete marksheets) sort last, but still appear —
  // hiding them would make a half-entered exam look complete.
  const sorted = [...rows].sort((a, b) => {
    if (a.rank == null && b.rank == null) return 0;
    if (a.rank == null) return 1;
    if (b.rank == null) return -1;
    return a.rank - b.rank;
  });

  async function csv() {
    if (!rows.length) { toast.error('Nothing to export', 'No results recorded.'); return; }
    try {
      const headers = ['Rank', 'Roll', 'Admission', 'Name',
        ...subjects.flatMap((s: any) => [`${s.subjectName} (/${s.maxMarks})`, `${s.subjectName} Grade`]),
        'Total', 'Max', '%', 'Overall Grade', 'Division'];
      const body = sorted.map(r => [
        r.rank ?? '', r.student?.rollNo ?? '', r.student?.admissionNo ?? '', r.student?.name ?? '',
        ...r.subjects.flatMap((sr: any) =>
          !sr ? ['', ''] : sr.status === 'absent' ? ['AB', ''] : [sr.marksObtained ?? '', sr.grade ?? '']),
        r.totalObtained, r.totalMax, r.overallPct, r.overallGrade ?? '', r.division ?? '',
      ]);
      await exportCSV(`results-${data?.exam?.name ?? 'exam'}`, headers, body);
      toast.success('Exported', 'Results downloaded.');
    } catch (e: any) { toast.error('Export failed', e.message); }
  }

  async function printable() {
    if (!rows.length) { toast.error('Nothing to export', 'No results recorded.'); return; }
    try {
      const headers = ['Rank', 'Roll', 'Name', ...subjects.map((s: any) => `${s.subjectName} /${s.maxMarks}`),
        'Total', '%', 'Grade', 'Division'];
      const body = sorted.map(r => [
        r.rank ?? '-', r.student?.rollNo ?? '-', r.student?.name ?? '',
        ...r.subjects.map((sr: any) =>
          !sr ? '-' : sr.status === 'absent' ? 'AB' : `${sr.marksObtained ?? '-'}`),
        `${r.totalObtained}/${r.totalMax}`, `${r.overallPct}%`, r.overallGrade ?? '-', r.division ?? '-',
      ]);
      const head = `<p><b>${data?.exam?.name}</b> &middot; Class ${data?.exam?.class}`
        + `${data?.exam?.section ? '-' + data.exam.section : ''}`
        + ` &middot; ${data?.exam?.academicYear ?? ''}</p>`
        + `<p>Pass ${stats.passPercentage ?? 0}% &middot; Average ${stats.avgPct ?? 0}%`
        + ` &middot; Highest ${stats.highPct ?? 0}%</p>`;
      await exportHTML(`results-${data?.exam?.name ?? 'exam'}`,
        `Results — ${data?.exam?.name ?? ''}`, head + htmlTable(headers, body));
      toast.success('Exported', 'Printable results ready.');
    } catch (e: any) { toast.error('Export failed', e.message); }
  }

  return (
    <Screen title={data?.exam?.name ?? name ?? t('nav.results', 'Results')}
      subtitle={data?.exam ? `Class ${data.exam.class}${data.exam.section ? '-' + data.exam.section : ''} \u00b7 ${data.exam.academicYear ?? ''}` : undefined}
      colors={rt.gradient} onBack={() => router.back()} scroll={false}
      right={rows.length > 0 ? (
        <TouchableOpacity onPress={csv} style={styles.iconBtn}>
          <Ionicons name="download-outline" size={20} color={colors.ink} />
        </TouchableOpacity>
      ) : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        {loading ? <Loading /> : rows.length === 0 ? (
          <EmptyState tint={moduleColor('exams')} icon="clipboard"
            text="No results recorded for this exam yet. Enter marks from Marks Entry first." />
        ) : (
          <>
            {/* KPIs */}
            <View style={styles.kpiRow}>
              <Kpi label="Pass %" value={`${stats.passPercentage ?? 0}%`}
                sub={`${stats.passCount ?? 0}/${stats.presentCount ?? 0}`}
                tint={num(stats.passPercentage) < 75 ? colors.danger : colors.emerald} />
              <Kpi label="Class average" value={`${stats.avgPct ?? 0}%`}
                sub={`${stats.totalStudents ?? 0} on roll`} tint={pctTint(num(stats.avgPct))} />
            </View>
            <View style={styles.kpiRow}>
              <Kpi label="Highest" value={`${stats.highPct ?? 0}%`}
                sub={classTopper?.name ?? '\u2014'} tint={colors.emerald} />
              <Kpi label="Failures" value={String(stats.failCount ?? 0)}
                sub={`${stats.absentCount ?? 0} absent`}
                tint={stats.failCount ? colors.danger : colors.emerald} />
            </View>

            {/* Class topper */}
            {classTopper && (
              <Card>
                <Text style={styles.trophy}>{'\u{1F3C6}'}  Class topper</Text>
                <Text style={styles.topName}>{classTopper.name}</Text>
                <Text style={styles.topSub}>Roll {classTopper.rollNo ?? '\u2014'}</Text>
                <Text style={[styles.topPct, { color: colors.amber }]}>{classTopper.percentage}%</Text>
                {classTopper.grade ? <Text style={styles.topGrade}>Grade {classTopper.grade}</Text> : null}
              </Card>
            )}

            {/* Division distribution */}
            {stats.divisions && (
              <Card>
                <Text style={styles.cardTitle}>Division-wise distribution</Text>
                {['First', 'Second', 'Third', 'Fail'].map(d => {
                  const n = stats.divisions?.[d] ?? 0;
                  const pct = stats.totalStudents ? Math.round((n / stats.totalStudents) * 100) : 0;
                  return (
                    <View key={d} style={{ marginBottom: 8 }}>
                      <View style={styles.divHead}>
                        <Text style={[styles.divName, { color: DIV_TINT[d] }]}>{d} Division</Text>
                        <Text style={styles.divCount}>{n} student{n === 1 ? '' : 's'} \u00b7 {pct}%</Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${Math.max(1, pct)}%`, backgroundColor: DIV_TINT[d] }]} />
                      </View>
                    </View>
                  );
                })}
              </Card>
            )}

            {/* Subject toppers */}
            {toppers.length > 0 && (
              <Card>
                <Text style={styles.cardTitle}>Subject toppers</Text>
                {toppers.map((t2: any, i: number) => (
                  <View key={i} style={styles.topperRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.topperSubject}>{t2.subjectName}</Text>
                      <Text style={styles.topperName}>{t2.topper.name}</Text>
                    </View>
                    <Text style={[styles.topperMarks, { color: colors.emerald }]}>
                      {t2.topper.marksObtained}/{t2.topper.maxMarks}
                      {t2.topper.percentage != null ? `  (${t2.topper.percentage}%)` : ''}
                    </Text>
                  </View>
                ))}
              </Card>
            )}

            {/* Ranked matrix — horizontally scrollable, one column per subject */}
            <Card>
              <View style={styles.headRow}>
                <Text style={styles.cardTitle}>Ranked results ({rows.length})</Text>
                <TouchableOpacity onPress={printable} hitSlop={8}>
                  <Ionicons name="print-outline" size={20} color={rt.accent} />
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  <View style={styles.tHead}>
                    <Text style={[styles.th, { width: 42 }]}>Rank</Text>
                    <Text style={[styles.th, { width: 42 }]}>Roll</Text>
                    <Text style={[styles.th, { width: 130 }]}>Name</Text>
                    {subjects.map((s: any, i: number) => (
                      <Text key={i} style={[styles.th, { width: 62, textAlign: 'right' }]} numberOfLines={1}>
                        {s.subjectName}
                      </Text>
                    ))}
                    <Text style={[styles.th, { width: 72, textAlign: 'right' }]}>Total</Text>
                    <Text style={[styles.th, { width: 52, textAlign: 'right' }]}>%</Text>
                    <Text style={[styles.th, { width: 48, textAlign: 'right' }]}>Grade</Text>
                    <Text style={[styles.th, { width: 62, textAlign: 'right' }]}>Division</Text>
                  </View>
                  {sorted.map((r, i) => (
                    <View key={i} style={[styles.tr, r.anyMissing && { opacity: 0.55 }]}>
                      <Text style={[styles.td, { width: 42, fontWeight: '800' }]}>{r.rank ?? '\u2014'}</Text>
                      <Text style={[styles.td, { width: 42 }]}>{r.student?.rollNo ?? '\u2014'}</Text>
                      <Text style={[styles.td, { width: 130 }]} numberOfLines={1}>{r.student?.name}</Text>
                      {r.subjects.map((sr: any, k: number) => {
                        const sub = subjects[k];
                        if (!sr) return <Text key={k} style={[styles.td, { width: 62, textAlign: 'right', color: colors.muted }]}>{'\u2014'}</Text>;
                        if (sr.status === 'absent') {
                          return <Text key={k} style={[styles.td, { width: 62, textAlign: 'right', color: colors.danger, fontWeight: '700' }]}>AB</Text>;
                        }
                        // Mirror the server's per-subject rule so the red here
                        // agrees with anyFail/division from the API.
                        const pass = sub?.passingMark ?? (num(sub?.maxMarks) * 0.33);
                        const failed = sr.marksObtained != null && num(sr.marksObtained) < pass;
                        return (
                          <Text key={k} style={[styles.td, { width: 62, textAlign: 'right' },
                            failed && { color: colors.danger, fontWeight: '700' }]}>
                            {sr.marksObtained ?? '\u2014'}
                          </Text>
                        );
                      })}
                      <Text style={[styles.td, { width: 72, textAlign: 'right' }]}>{r.totalObtained}/{r.totalMax}</Text>
                      <Text style={[styles.td, { width: 52, textAlign: 'right', fontWeight: '800', color: pctTint(num(r.overallPct)) }]}>
                        {r.overallPct}%
                      </Text>
                      <Text style={[styles.td, { width: 48, textAlign: 'right' }]}>{r.overallGrade ?? '\u2014'}</Text>
                      <Text style={[styles.td, { width: 62, textAlign: 'right', fontWeight: '700' },
                        r.division ? { color: DIV_TINT[r.division] } : { color: colors.muted }]}>
                        {r.division ?? '\u2014'}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
              {rows.some(r => r.anyMissing) && (
                <Text style={styles.note}>
                  Dimmed rows have subjects with no marks entered — they are excluded from ranking.
                </Text>
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Kpi({ label, value, sub, tint }: { label: string; value: string; sub?: string; tint: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={styles.kpiSub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },

  kpiRow: { flexDirection: 'row', gap: spacing.sm },
  kpi: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.line },
  kpiLabel: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0 },
  kpiValue: { ...font.h2, fontWeight: '800', marginTop: 2 },
  kpiSub: { ...font.caption, color: colors.slate, textTransform: 'none', letterSpacing: 0, marginTop: 1 },

  cardTitle: { ...font.title, color: colors.ink, marginBottom: spacing.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  note: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0, marginTop: spacing.sm },

  trophy: { ...font.label, color: colors.amber, fontWeight: '800' },
  topName: { ...font.h3, color: colors.ink, fontWeight: '800', marginTop: 4 },
  topSub: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0 },
  topPct: { ...font.h1, fontWeight: '800', marginTop: 4 },
  topGrade: { ...font.label, color: colors.amber, fontWeight: '700' },

  divHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  divName: { ...font.caption, fontWeight: '800', textTransform: 'none', letterSpacing: 0 },
  divCount: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },

  topperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: colors.line },
  topperSubject: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0 },
  topperName: { ...font.body, color: colors.ink, fontWeight: '600' },
  topperMarks: { ...font.body, fontWeight: '800' },

  tHead: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  th: { ...font.caption, color: colors.muted, fontWeight: '700', paddingHorizontal: 3 },
  tr: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  td: { ...font.body, color: colors.ink, paddingHorizontal: 3 },
});
