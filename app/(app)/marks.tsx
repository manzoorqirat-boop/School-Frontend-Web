import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TextInput, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, ListItem, EmptyState, Loading, FormModal } from '@/components/screen';
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
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // Bulk entry. The Next.js app read navigator.clipboard directly, which is
  // web-only and needs a permission grant; RN 0.74 dropped the built-in
  // Clipboard module and expo-clipboard is not a dependency here. A box the
  // teacher pastes INTO works identically on both platforms with no new
  // dependency — and it lets them see what landed before it is applied.
  function applyPaste() {
    // One value per line. Excel copies a column as newline-separated, and a
    // multi-column selection as tab-separated — take the first cell of each
    // row so either shape works.
    const values = pasteText.split(/\r?\n/)
      .map(line => line.split('\t')[0].trim())
      .filter(v => v !== '');
    if (values.length === 0) { toast.error('Nothing to paste', 'Paste a column of marks first.'); return; }

    let applied = 0, skipped = 0;
    setGrid(prev => prev.map((row, i) => {
      if (i >= values.length) return row;
      const raw = values[i];
      const up = raw.toUpperCase();
      if (up === 'AB' || up === 'A' || up === 'ABSENT') { applied++; return { ...row, status: 'absent', marks: '' }; }
      const n = parseFloat(raw);
      if (Number.isNaN(n)) { skipped++; return row; }
      applied++;
      return { ...row, status: 'present', marks: String(n) };
    }));

    setDirty(true);
    setPasteOpen(false);
    setPasteText('');
    // Values map to rows IN ORDER — say so, because a mismatched paste is
    // silently wrong otherwise.
    toast.success('Pasted',
      `${applied} value(s) applied in list order${skipped ? `, ${skipped} skipped (not a number)` : ''}. Review, then Save.`);
  }

  function markAllPresent() {
    setDirty(true);
    setGrid(prev => prev.map(r => r.status === 'absent' ? { ...r, status: 'present' } : r));
  }

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
          <View style={styles.toolbar}>
            <TouchableOpacity onPress={() => { setPasteText(''); setPasteOpen(true); }} style={styles.toolBtn}>
              <Ionicons name="clipboard-outline" size={15} color={rt.accent} />
              <Text style={[styles.toolText, { color: rt.accent }]}>Paste from Excel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={markAllPresent} style={styles.toolBtn}>
              <Ionicons name="checkmark-done-outline" size={15} color={colors.slate} />
              <Text style={[styles.toolText, { color: colors.slate }]}>All present</Text>
            </TouchableOpacity>
          </View>
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
      {/* Paste from Excel */}
      <FormModal visible={pasteOpen} title="Paste marks from Excel"
        onClose={() => setPasteOpen(false)} onSubmit={applyPaste} submitLabel="Apply">
        <Text style={styles.pasteHint}>
          Copy one column of marks from your spreadsheet and paste it below — one value per line,
          in the same order as the list. Use AB for absent.
        </Text>
        <TextInput
          style={styles.pasteBox}
          value={pasteText}
          onChangeText={setPasteText}
          multiline
          numberOfLines={8}
          placeholder={'85\n72\nAB\n64'}
          placeholderTextColor={colors.muted}
          textAlignVertical="top"
          autoFocus
        />
        <Text style={styles.pasteHint}>
          {pasteText.split(/\r?\n/).filter(v => v.trim() !== '').length} value(s) ready
          {' \u00b7 '}{grid.length} student(s) in the list
        </Text>
      </FormModal>

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
  toolbar: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  toolBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, minHeight: 44, borderRadius: radius.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line },
  toolText: { ...font.label, fontWeight: '600' },
  pasteBox: { minHeight: 150, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    padding: spacing.md, ...font.body, color: colors.ink, backgroundColor: colors.surface },
  pasteHint: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0,
    lineHeight: 16, marginBottom: 6, marginTop: 6 },
  saveBar: { padding: spacing.lg, backgroundColor: colors.bg,
    borderTopWidth: 1, borderTopColor: colors.line,
    // Was position:absolute/bottom:0 — anchored to the window, so on a tall
    // desktop viewport it fell outside the visible scroll area. Sticky keeps
    // it pinned to the bottom of the scroller on web; native stacks it inline.
    ...(Platform.OS === 'web' ? { position: 'sticky' as any, bottom: 0, zIndex: 10 } : null),
  },
});
