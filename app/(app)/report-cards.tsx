import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, EmptyState, Loading } from '@/components/screen';
import { Card } from '@/components/ui';
import { exportHTML, htmlTable } from '@/lib/export';
import { Ionicons } from '@expo/vector-icons';
import { toast } from '@/components/toast';

// Report cards for parent/student. Parents with multiple children get a switcher.
export default function ReportCards() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);

  const childIds: string[] = user?.role === 'student'
    ? (user?.studentId ? [user.studentId] : [])
    : (Array.isArray(user?.parentOf) ? user!.parentOf : []);

  const [activeChild, setActiveChild] = useState<string | undefined>(childIds[0]);
  const [childNames, setChildNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (childIds.length < 2) return;
    API.get('/api/students?limit=20')
      .then((d: any) => {
        const map: Record<string, string> = {};
        (d.items ?? []).forEach((st: any) => { map[st._id] = `${st.firstName} ${st.lastName ?? ''}`.trim(); });
        setChildNames(map);
      })
      .catch(() => {});
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  const [report, setReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (sid?: string) => {
    if (!sid) { setLoading(false); return; }
    setLoading(true);
    try { const data = await API.get(`/api/report-cards/student/${sid}`); setReport(data); }
    catch (e: any) { toast.error('Error', e.message); setReport(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(activeChild); }, [activeChild, load]);

  async function doExport() {
    if (!report) return;
    try {
      const name = `${report.student?.firstName ?? 'student'}`;
      let body = '';
      (report.exams ?? []).forEach((ex: any) => {
        body += `<h2 style="color:#6D3CF0;font-size:16px;margin-top:16px">${ex.examName} — ${ex.percentage}%</h2>`;
        body += htmlTable(['Subject', 'Marks', 'Grade'],
          (ex.subjects ?? []).map((sub: any) => [sub.subjectName, sub.status === 'absent' ? 'AB' : `${sub.marksObtained ?? '-'}/${sub.maxMarks}`, sub.grade ?? '']));
      });
      await exportHTML(`report-card-${name}`, `Report Card — ${name}`, body);
    } catch (e: any) { toast.error('Export failed', e.message); }
  }

  return (
    <Screen title={t('nav.reportCards', 'Report Cards')} subtitle={report?.student ? `${report.student.firstName} ${report.student.lastName ?? ''}`.trim() : 'Exam results'}
      colors={rt.gradient} onBack={() => router.back()}
      right={report ? <TouchableOpacity onPress={doExport} style={{ width: 40, height: 40, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="share-outline" size={22} color={colors.ink} /></TouchableOpacity> : undefined}>

      {childIds.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: spacing.md }}>
          {childIds.map((id, i) => {
            const on = id === activeChild;
            return (
              <TouchableOpacity key={id} onPress={() => setActiveChild(id)}
                style={[styles.childChip, on && { backgroundColor: rt.accent }]}>
                <Text style={[styles.childText, on && { color: '#fff' }]}>{childNames[id] ?? `Child ${i + 1}`}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loading ? <Loading /> : !report || (report.exams ?? []).length === 0 ? (
        <EmptyState tint={moduleColor('report-cards')} icon="ribbon" text="No published results yet." />
      ) : (
        (report.exams ?? []).map((ex: any, i: number) => (
          <Card key={i} style={{ marginBottom: spacing.md }}>
            <View style={styles.examHead}>
              <Text style={styles.examName}>{ex.examName}</Text>
              <View style={[styles.pctBadge, { backgroundColor: pctTint(ex.percentage) + '18' }]}>
                <Text style={[styles.pctText, { color: pctTint(ex.percentage) }]}>{ex.percentage}%</Text>
              </View>
            </View>
            {(ex.subjects ?? []).map((s: any, j: number) => (
              <View key={j} style={styles.subRow}>
                <Text style={styles.subName}>{s.subjectName}</Text>
                <Text style={styles.subMark}>
                  {s.status === 'absent' ? 'AB' : `${s.marksObtained ?? '—'}/${s.maxMarks}`}
                  {s.grade ? `  ·  ${s.grade}` : ''}
                </Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{ex.totalObtained}/{ex.totalMax}</Text>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

function pctTint(p: number) {
  if (p >= 75) return colors.emerald;
  if (p >= 50) return colors.amber;
  if (p >= 33) return colors.sky;
  return colors.danger;
}

const styles = StyleSheet.create({
  childChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.card },
  childText: { ...font.label, color: colors.slate },
  examHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  examName: { ...font.h3, color: colors.ink, flex: 1 },
  pctBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill },
  pctText: { ...font.title, fontWeight: '800' },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: colors.line },
  subName: { ...font.body, color: colors.slate },
  subMark: { ...font.body, color: colors.ink, fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm },
  totalLabel: { ...font.title, color: colors.primary },
  totalValue: { ...font.title, color: colors.primary },
});