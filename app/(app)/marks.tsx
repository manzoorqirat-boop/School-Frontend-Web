import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TextInput, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, ListItem, EmptyState, Loading } from '@/components/screen';
import { GradientButton } from '@/components/ui';
import { toast } from '@/components/toast';

// Teacher marks entry: exam list → subject → grid → save.
export default function Marks() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);

  const [step, setStep] = useState<'exam' | 'subject' | 'grid'>('exam');
  const [exams, setExams] = useState<any[]>([]);
  const [exam, setExam] = useState<any>(null);
  const [subject, setSubject] = useState<any>(null);
  const [grid, setGrid] = useState<any[]>([]);          // {student, result, marks, status}
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadExams = useCallback(async () => {
    try { const data = await API.get('/api/exams'); setExams(data.items ?? []); }
    catch (e: any) { toast.error('Error', e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadExams(); }, [loadExams]);

  // Marks live in local state until Save POSTs them. Leaving the grid — via
  // back, or by picking another subject — refetches and silently discards
  // everything typed. Track it and warn.
  const [dirty, setDirty] = useState(false);

  async function pickExam(e: any) {
    setExam(e); setSubject(null); setStep('subject');
  }

  async function pickSubject(sub: any) {
    setSubject(sub); setLoading(true);
    try {
      const data = await API.get(`/api/exams/${exam._id}/marksheet`);
      // marksheet returns students[] each with marks[] per subject; flatten to this subject.
      const rows = (data.students ?? []).map((row: any) => {
        const cell = (row.marks ?? []).find((m: any) => m.subjectId === sub.subjectId);
        return {
          studentId: row.student._id,
          name: `${row.student.firstName} ${row.student.lastName ?? ''}`.trim(),
          rollNo: row.student.rollNo,
          maxMarks: cell?.maxMarks ?? sub.maxMarks ?? 100,
          marks: cell?.result?.marksObtained != null ? String(cell.result.marksObtained) : '',
          status: cell?.result?.status ?? 'present',
        };
      });
      setGrid(rows);
      setDirty(false);
      setStep('grid');
    } catch (e: any) { toast.error('Error', e.message); }
    finally { setLoading(false); }
  }

  function setMark(id: string, val: string) {
    setDirty(true);
    setGrid(prev => prev.map(r => r.studentId === id ? { ...r, marks: val, status: 'present' } : r));
  }
  function toggleAbsent(id: string) {
    setDirty(true);
    setGrid(prev => prev.map(r => r.studentId === id
      ? { ...r, status: r.status === 'absent' ? 'present' : 'absent', marks: r.status === 'absent' ? r.marks : '' }
      : r));
  }

  async function save() {
    const bad = grid.filter(r => r.status !== 'absent' && r.marks !== ''
      && (isNaN(parseFloat(r.marks)) || parseFloat(r.marks) > r.maxMarks || parseFloat(r.marks) < 0));
    if (bad.length) {
      toast.error('Invalid marks', `${bad.length} entr${bad.length === 1 ? 'y is' : 'ies are'} over max marks or invalid (shown in red). Fix before saving.`);
      return;
    }
    setSaving(true);
    try {
      const cells = grid.map(r => ({
        studentId: r.studentId, subjectId: subject.subjectId,
        marksObtained: r.status === 'absent' ? null : (r.marks === '' ? null : parseFloat(r.marks)),
        maxMarks: r.maxMarks, status: r.status,
      }));
      const res = await API.post(`/api/exams/${exam._id}/marksheet/save`, { cells });
      toast.success('Saved', `${res.saved} marks recorded.`);
      setDirty(false);
      setStep('subject');
    } catch (e: any) { toast.error('Save failed', e.message); }
    finally { setSaving(false); }
  }

  const goBack = () => {
    if (step === 'grid' && dirty) {
      toast.error('Unsaved marks', 'Save or clear your changes before leaving this subject.');
      return;
    }
    if (step === 'grid') setStep('subject');
    else if (step === 'subject') setStep('exam');
    else router.back();
  };

  if (loading && step === 'exam') return <Screen title={t('nav.marks', 'Marks Entry')} colors={rt.gradient} onBack={goBack}><Loading /></Screen>;

  return (
    <Screen
      title={step === 'exam' ? 'Marks Entry' : step === 'subject' ? exam?.name ?? 'Subject' : subject?.subjectName ?? 'Marks'}
      subtitle={step === 'grid' ? `${exam?.name} · ${grid.length} students` : step === 'subject' ? 'Pick a subject' : 'Pick an exam'}
      colors={rt.gradient} onBack={goBack} scroll={false}
    >
      {step === 'exam' && (
        <FlatList
          data={exams}
          keyExtractor={e => e._id}
          contentContainerStyle={{ padding: spacing.lg }}
          ListEmptyComponent={<EmptyState tint={moduleColor('marks')} icon="document-text" text="No exams available." />}
          renderItem={({ item: e }) => (
            <ListItem title={e.name} subtitle={`${e.class}${e.section ? '-' + e.section : ''} · ${e.type ?? ''}`}
              onPress={() => pickExam(e)} />
          )}
        />
      )}

      {step === 'subject' && (
        loading ? <Loading /> :
        <FlatList
          data={exam?.subjects ?? []}
          keyExtractor={(s, i) => s.subjectId ?? String(i)}
          contentContainerStyle={{ padding: spacing.lg }}
          ListEmptyComponent={<EmptyState tint={moduleColor('marks')} icon="book" text="No subjects on this exam." />}
          renderItem={({ item: s }) => (
            <ListItem title={s.subjectName} subtitle={`Max marks: ${s.maxMarks}`} onPress={() => pickSubject(s)} />
          )}
        />
      )}

      {step === 'grid' && (
        <>
          <FlatList
            data={grid}
            keyExtractor={r => r.studentId}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
            renderItem={({ item: r }) => {
              const absent = r.status === 'absent';
              return (
                <View style={styles.gridRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{r.name}</Text>
                    <Text style={styles.roll}>Roll {r.rollNo ?? '—'}</Text>
                  </View>
                  <TextInput
                    style={[styles.markInput, absent && styles.markDisabled,
                      !absent && r.marks !== '' && (parseFloat(r.marks) > r.maxMarks || parseFloat(r.marks) < 0) && styles.markInvalid]}
                    value={absent ? '' : r.marks}
                    editable={!absent}
                    onChangeText={v => setMark(r.studentId, v)}
                    keyboardType="numeric" placeholder="—" placeholderTextColor={colors.muted}
                    maxLength={5}
                  />
                  <Text style={styles.outOf}>/{r.maxMarks}</Text>
                  <TouchableOpacity onPress={() => toggleAbsent(r.studentId)}
                    style={[styles.absBtn, absent && { backgroundColor: colors.danger }]}>
                    <Text style={[styles.absText, absent && { color: '#fff' }]}>AB</Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
          <View style={styles.saveBar}>
            <GradientButton label="Save Marks" onPress={save} loading={saving} colors={rt.gradient} />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.card,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  name: { ...font.title, color: colors.ink },
  roll: { ...font.label, color: colors.muted },
  markInput: { width: 56, height: 40, borderRadius: radius.sm, backgroundColor: colors.bg, textAlign: 'center',
    ...font.title, color: colors.ink },
  markInvalid: { borderWidth: 1.5, borderColor: colors.danger, color: colors.danger },
  markDisabled: { backgroundColor: colors.line },
  outOf: { ...font.label, color: colors.muted },
  absBtn: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center' },
  absText: { ...font.caption, color: colors.slate },
  saveBar: { padding: spacing.lg, backgroundColor: colors.bg,
    borderTopWidth: 1, borderTopColor: colors.line,
    // Was position:absolute/bottom:0 — anchored to the window, so on a tall
    // desktop viewport it fell outside the visible scroll area. Sticky keeps
    // it pinned to the bottom of the scroller on web; native stacks it inline.
    ...(Platform.OS === 'web' ? { position: 'sticky' as any, bottom: 0, zIndex: 10 } : null),
  },
});