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
import { Screen, ChipPicker, SearchBar, EmptyState, Loading } from '@/components/screen';
import { Card } from '@/components/ui';
import { exportHTML, htmlTable } from '@/lib/export';
import { toast } from '@/components/toast';

// ─────────────────────────────────────────────────────────────────────────────
// Report cards — STAFF view
//
// `report-cards.tsx` renders a report card for the SIGNED-IN user's own
// children (parent) or self (student): it reads user.parentOf / user.studentId.
// For an admin, principal or teacher both are empty, so that screen shows
// nothing — which is why it is not on the staff dashboard.
//
// The API has always allowed staff through. ReportCardsController row-scopes
// ONLY parent and student:
//
//     if (_tenant.Role == "parent")  { ...must own the student... }
//     if (_tenant.Role == "student") { ...must be the student... }
//     // staff fall through — any student in the tenant is allowed
//
// So GET /api/report-cards/student/{id} already works for staff; there was
// simply no screen that let them choose a student. This is that screen:
// filter by class/section, search, pick a student, see the aggregated card,
// export it.
//
// Exams -> tap an exam only ever showed "Results entered: N" — a count, not the
// marks — so this was the missing half of the exam workflow.
// ─────────────────────────────────────────────────────────────────────────────

const money = (n: any) => Number(n ?? 0);

function gradeTint(pct: number) {
  if (pct >= 75) return colors.emerald;
  if (pct >= 50) return colors.amber;
  if (pct >= 33) return colors.warning;
  return colors.danger;
}

export default function StaffReportCards() {
  const router = useRouter();
  const { user } = useAuth();
  const { classes, sections, academicYear } = useSchoolConfig();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);

  const [cls, setCls] = useState('');
  const [sec, setSec] = useState('');
  const [q, setQ] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(true);

  const [picked, setPicked] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadStudents = useCallback(async () => {
    setListLoading(true);
    try {
      const params = [
        cls ? `class=${encodeURIComponent(cls)}` : '',
        sec ? `section=${encodeURIComponent(sec)}` : '',
        q.trim() ? `q=${encodeURIComponent(q.trim())}` : '',
        'status=active', 'limit=100',
      ].filter(Boolean).join('&');
      const data = await API.get(`/api/students?${params}`);
      setStudents(data.items ?? []);
    } catch (e: any) { toast.error('Could not load students', e.message); }
    finally { setListLoading(false); }
  }, [cls, sec, q]);

  useEffect(() => {
    // Debounce so typing in the search box doesn't fire a request per keystroke.
    const id = setTimeout(loadStudents, q ? 350 : 0);
    return () => clearTimeout(id);
  }, [loadStudents, q]);

  async function open(s: any) {
    setPicked(s); setReport(null); setLoading(true);
    try {
      const qs = academicYear ? `?academicYear=${encodeURIComponent(academicYear)}` : '';
      const data = await API.get(`/api/report-cards/student/${s._id}${qs}`);
      setReport(data);
    } catch (e: any) {
      toast.error('Could not load report card', e.message);
      setPicked(null);
    } finally { setLoading(false); }
  }

  async function doExport() {
    if (!report) return;
    const st = report.student ?? {};
    const name = `${st.firstName ?? ''} ${st.lastName ?? ''}`.trim() || 'student';
    try {
      let body = `<p><b>${name}</b> &middot; Class ${st.class ?? ''}${st.section ? '-' + st.section : ''}`
        + `${st.rollNo ? ` &middot; Roll ${st.rollNo}` : ''}`
        + `${st.admissionNo ? ` &middot; Adm ${st.admissionNo}` : ''}`
        + `${report.academicYear ? ` &middot; ${report.academicYear}` : ''}</p>`;

      (report.exams ?? []).forEach((ex: any) => {
        body += `<h2>${ex.examName} — ${ex.percentage}% (${ex.totalObtained}/${ex.totalMax})</h2>`;
        body += htmlTable(['Subject', 'Marks', 'Grade'],
          (ex.subjects ?? []).map((sub: any) => [
            sub.subjectName,
            sub.status === 'absent' ? 'AB' : `${sub.marksObtained ?? '-'}/${sub.maxMarks}`,
            sub.grade ?? '',
          ]));
      });

      if ((report.exams ?? []).length === 0) body += '<p>No results recorded yet.</p>';

      await exportHTML(`report-card-${name.replace(/\s+/g, '-')}`, `Report Card — ${name}`, body);
      toast.success('Exported', 'Report card ready.');
    } catch (e: any) { toast.error('Export failed', e.message); }
  }

  if (!can(user, 'exam:view')) {
    return (
      <Screen title="Report Cards" colors={rt.gradient} onBack={() => router.back()}>
        <EmptyState tint={moduleColor('report-cards')} icon="lock-closed"
          text="You don't have permission to view report cards." />
      </Screen>
    );
  }

  // ── Detail ────────────────────────────────────────────────────────────────
  if (picked) {
    const st = report?.student ?? picked;
    const exams: any[] = report?.exams ?? [];
    // Overall across every exam in the year — the aggregate a report card leads
    // with. Computed here because the API returns per-exam totals only.
    const totObt = exams.reduce((a, e) => a + money(e.totalObtained), 0);
    const totMax = exams.reduce((a, e) => a + money(e.totalMax), 0);
    const overall = totMax > 0 ? Math.round((totObt * 1000) / totMax) / 10 : 0;

    return (
      <Screen title={`${st.firstName ?? ''} ${st.lastName ?? ''}`.trim() || 'Report Card'}
        subtitle={`Class ${st.class ?? ''}${st.section ? '-' + st.section : ''}${report?.academicYear ? ' \u00b7 ' + report.academicYear : ''}`}
        colors={rt.gradient} onBack={() => { setPicked(null); setReport(null); }}
        right={report ? (
          <TouchableOpacity onPress={doExport} style={styles.iconBtn}>
            <Ionicons name="download-outline" size={20} color={colors.ink} />
          </TouchableOpacity>
        ) : undefined}
        scroll={false}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
          {loading ? <Loading /> : exams.length === 0 ? (
            <EmptyState tint={moduleColor('report-cards')} icon="document-text"
              text={`No results recorded for this student${report?.academicYear ? ` in ${report.academicYear}` : ''} yet. Enter marks from Marks Entry first.`} />
          ) : (
            <>
              <Card>
                <Text style={styles.overallLabel}>Overall</Text>
                <Text style={[styles.overallPct, { color: gradeTint(overall) }]}>{overall}%</Text>
                <Text style={styles.overallSub}>
                  {totObt}/{totMax} across {exams.length} exam{exams.length === 1 ? '' : 's'}
                </Text>
              </Card>

              {exams.map((ex, i) => (
                <Card key={i}>
                  <View style={styles.examHead}>
                    <Text style={styles.examName}>{ex.examName}</Text>
                    <Text style={[styles.examPct, { color: gradeTint(money(ex.percentage)) }]}>
                      {ex.percentage}%
                    </Text>
                  </View>
                  <Text style={styles.examSub}>{ex.totalObtained}/{ex.totalMax}</Text>

                  <View style={styles.tableHead}>
                    <Text style={[styles.th, { flex: 2 }]}>Subject</Text>
                    <Text style={[styles.th, { width: 80, textAlign: 'right' }]}>Marks</Text>
                    <Text style={[styles.th, { width: 52, textAlign: 'right' }]}>Grade</Text>
                  </View>
                  {(ex.subjects ?? []).map((sub: any, k: number) => {
                    const absent = sub.status === 'absent';
                    const exempt = sub.status === 'exempted';
                    return (
                      <View key={k} style={styles.tr}>
                        <Text style={[styles.td, { flex: 2 }]} numberOfLines={1}>{sub.subjectName}</Text>
                        <Text style={[styles.td, { width: 80, textAlign: 'right' },
                          absent && { color: colors.danger }, exempt && { color: colors.muted }]}>
                          {absent ? 'AB' : exempt ? 'EX' : `${sub.marksObtained ?? '-'}/${sub.maxMarks}`}
                        </Text>
                        <Text style={[styles.td, { width: 52, textAlign: 'right', fontWeight: '700' },
                          sub.isPassing === false && { color: colors.danger }]}>
                          {sub.grade ?? '\u2014'}
                        </Text>
                      </View>
                    );
                  })}
                </Card>
              ))}
            </>
          )}
        </ScrollView>
      </Screen>
    );
  }

  // ── Student picker ────────────────────────────────────────────────────────
  return (
    <Screen title={t('nav.reportCards', 'Report Cards')} subtitle="Pick a student"
      colors={rt.gradient} onBack={() => router.back()} scroll={false}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <Card>
          <SearchBar value={q} onChangeText={setQ} placeholder="Name or admission no…" />
          <ChipPicker label="Class" options={['', ...classes]} value={cls} onChange={setCls} />
          <ChipPicker label="Section" options={['', ...sections]} value={sec} onChange={setSec} />
        </Card>

        {listLoading ? <Loading /> : students.length === 0 ? (
          <EmptyState tint={moduleColor('report-cards')} icon="people"
            text="No students match these filters." />
        ) : (
          <Card>
            <Text style={styles.count}>{students.length} student{students.length === 1 ? '' : 's'}</Text>
            {students.map(s => (
              <TouchableOpacity key={s._id} style={styles.row} onPress={() => open(s)}>
                <View style={[styles.roll, { backgroundColor: rt.accent + '18' }]}>
                  <Text style={[styles.rollText, { color: rt.accent }]}>{s.rollNo ?? '-'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{`${s.firstName ?? ''} ${s.lastName ?? ''}`.trim()}</Text>
                  <Text style={styles.sub}>
                    Class {s.class}{s.section ? '-' + s.section : ''}
                    {s.admissionNo ? ` \u00b7 Adm ${s.admissionNo}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </TouchableOpacity>
            ))}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },

  count: { ...font.label, color: colors.muted, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.line },
  roll: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  rollText: { ...font.label, fontWeight: '800' },
  name: { ...font.body, color: colors.ink, fontWeight: '600' },
  sub: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0, marginTop: 1 },

  overallLabel: { ...font.label, color: colors.muted },
  overallPct: { ...font.h1, fontWeight: '800', marginTop: 2 },
  overallSub: { ...font.caption, color: colors.slate, textTransform: 'none', letterSpacing: 0, marginTop: 2 },

  examHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  examName: { ...font.title, color: colors.ink, flex: 1 },
  examPct: { ...font.title, fontWeight: '800' },
  examSub: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0, marginBottom: spacing.sm },

  tableHead: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  th: { ...font.caption, color: colors.muted, fontWeight: '700' },
  tr: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  td: { ...font.body, color: colors.ink },
});
