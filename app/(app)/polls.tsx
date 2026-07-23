import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, ListItem, EmptyState, Loading, Field, ChipPicker, FormModal } from '@/components/screen';
import { toast } from '@/components/toast';

const STATUS_TINT: Record<string, string> = { draft: colors.muted, active: colors.success, closed: colors.info };
const ADMINISH = ['school_admin', 'principal', 'superadmin'];

type QDraft = { text: string; options: string[] };

export default function Polls() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);
  const canManage = ADMINISH.includes(user?.role ?? '');

  const [polls, setPolls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<any>({});
  const [qs, setQs] = useState<QDraft[]>([]);

  const load = useCallback(async () => {
    try { const data = await API.get<any>('/api/polls'); setPolls(Array.isArray(data) ? data : data.items ?? []); }
    catch (e: any) { toast.error('Error', e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── Vote ────────────────────────────────────────────────────────────────
  function openPoll(p: any) { setActive(p); setAnswers({}); setResults(null); }

  async function vote() {
    const payload = (active.questions ?? [])
      .filter((q: any) => answers[q._id])
      .map((q: any) => ({ questionId: q._id, optionId: answers[q._id] }));
    if (payload.length !== (active.questions ?? []).length) { toast.error('Incomplete', 'Answer every question before submitting.'); return; }
    setSaving(true);
    try {
      await API.post(`/api/polls/${active._id}/vote`, { answers: payload });
      toast.success('Thanks!', 'Your vote has been recorded.');
      loadResults(active);
    } catch (e: any) { toast.error(e.message?.includes('already') ? 'Already voted' : 'Failed', e.message); }
    finally { setSaving(false); }
  }

  async function loadResults(p: any) {
    try { const r = await API.get(`/api/polls/${p._id}/results`); setResults(r); } catch {}
  }

  // ── Manage ──────────────────────────────────────────────────────────────
  function openCreate() {
    setForm({ targetRoles: 'parent,teacher' });
    setQs([{ text: '', options: ['', ''] }]);
    setCreateOpen(true);
  }

  async function create() {
    if (!form.title?.trim()) { toast.error('Missing', 'Poll title is required.'); return; }
    const cleanQs = qs
      .map(q => ({ text: q.text.trim(), options: q.options.map(o => o.trim()).filter(Boolean).map(o => ({ text: o })) }))
      .filter(q => q.text);
    if (!cleanQs.length) { toast.error('Missing', 'Add at least one question.'); return; }
    const short = cleanQs.find(q => q.options.length < 2);
    if (short) { toast.error('Invalid', `"${short.text}" needs at least 2 options.`); return; }
    setSaving(true);
    try {
      const created = await API.post('/api/polls', {
        title: form.title.trim(), description: form.description?.trim() || undefined,
        targetRoles: String(form.targetRoles ?? 'parent,teacher').split(',').map((s: string) => s.trim()).filter(Boolean),
        status: 'active',
        questions: cleanQs,
      });
      setPolls(prev => [created, ...prev]);
      setCreateOpen(false);
    } catch (e: any) { toast.error('Failed', e.message); }
    finally { setSaving(false); }
  }

  async function closePoll(p: any) {
    try {
      const updated = await API.put(`/api/polls/${p._id}`, { ...p, status: 'closed' });
      setPolls(prev => prev.map(x => x._id === p._id ? updated : x));
      setActive(null);
    } catch (e: any) { toast.error('Failed', e.message); }
  }
  async function confirmDelete(p: any) {
    const ok = await confirm({
      title: 'Delete poll',
      message: `Delete "${p.title}" and all its votes?`,
      confirmLabel: 'Delete', destructive: true,
    });
    if (!ok) return;
    try {
      await API.del(`/api/polls/${p._id}`);
      setPolls(prev => prev.filter(x => x._id !== p._id));
      setActive(null);
      toast.success('Poll deleted', `"${p.title}" and its votes were removed.`);
    } catch (e: any) { toast.error('Failed', e.message); }
  }

  if (loading) return <Screen title={t('nav.polls', 'Polls')} colors={rt.gradient} onBack={() => router.back()}><Loading /></Screen>;

  return (
    <Screen title={t('nav.polls', 'Polls')} subtitle={`${polls.length} polls`} colors={rt.gradient} onBack={() => router.back()} scroll={false}
      right={canManage ? <TouchableOpacity onPress={openCreate} style={[styles.hBtn, { backgroundColor: moduleColor('polls'), borderColor: moduleColor('polls') }]}><Ionicons name="add" size={22} color="#fff" /></TouchableOpacity> : undefined}>
      <FlatList
        data={polls}
        keyExtractor={p => p._id}
        contentContainerStyle={{ padding: spacing.lg }}
        ListEmptyComponent={<EmptyState tint={moduleColor('polls')} icon="bar-chart" text={canManage ? 'No polls yet. Use + to create one.' : 'No polls right now.'} />}
        renderItem={({ item: p }) => (
          <ListItem
            title={p.title}
            subtitle={`${(p.questions ?? []).length} question(s) · for ${(p.targetRoles ?? []).join(', ') || 'everyone'}`}
            badge={p.status ?? 'active'} badgeTint={STATUS_TINT[p.status ?? 'active']}
            onPress={() => openPoll(p)}
          />
        )}
      />

      {/* Vote / results / manage */}
      <FormModal visible={!!active} title={active?.title ?? ''} onClose={() => setActive(null)}
        onSubmit={results || active?.status === 'closed' ? () => setActive(null) : vote}
        submitting={saving}
        submitLabel={results || active?.status === 'closed' ? 'Close' : 'Submit vote'}>
        {active && !results && active.status !== 'closed' && (
          <>
            {active.description ? <Text style={styles.desc}>{active.description}</Text> : null}
            {(active.questions ?? []).map((q: any) => (
              <View key={q._id} style={{ marginBottom: spacing.md }}>
                <Text style={styles.qText}>{q.text}</Text>
                {(q.options ?? []).map((o: any) => {
                  const on = answers[q._id] === o._id;
                  return (
                    <TouchableOpacity key={o._id} onPress={() => setAnswers({ ...answers, [q._id]: o._id })} style={styles.optRow}>
                      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={19} color={on ? colors.primary : colors.muted} />
                      <Text style={styles.optText}>{o.text}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            {active.showResultsBeforeClose !== false && (
              <TouchableOpacity onPress={() => loadResults(active)}>
                <Text style={styles.link}>View results instead</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {active && (results || active.status === 'closed') && (
          <>
            {!results && <TouchableOpacity onPress={() => loadResults(active)}><Text style={styles.link}>Load results</Text></TouchableOpacity>}
            {(results?.questions ?? []).map((q: any) => {
              const total = (q.options ?? []).reduce((a: number, o: any) => a + (o.votes ?? 0), 0);
              return (
                <View key={q.questionId ?? q._id} style={{ marginBottom: spacing.md }}>
                  <Text style={styles.qText}>{q.text}</Text>
                  {(q.options ?? []).map((o: any) => {
                    const pct = total ? Math.round(((o.votes ?? 0) / total) * 100) : 0;
                    return (
                      <View key={o.optionId ?? o._id} style={{ marginBottom: 6 }}>
                        <View style={styles.resRow}>
                          <Text style={styles.optText}>{o.text}</Text>
                          <Text style={styles.resPct}>{pct}% ({o.votes ?? 0})</Text>
                        </View>
                        <View style={styles.barTrack}><View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: rt.accent }]} /></View>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </>
        )}

        {active && canManage && (
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            {active.status === 'active' && (
              <TouchableOpacity style={styles.mBtn} onPress={() => closePoll(active)}>
                <Ionicons name="stop-circle-outline" size={15} color={colors.ink} /><Text style={styles.mText}>Close poll</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.mBtn, { borderColor: colors.danger + '55' }]} onPress={() => confirmDelete(active)}>
              <Ionicons name="trash-outline" size={15} color={colors.danger} /><Text style={[styles.mText, { color: colors.danger }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </FormModal>

      {/* Create */}
      <FormModal visible={createOpen} title="New poll" onClose={() => setCreateOpen(false)}
        onSubmit={create} submitting={saving} submitLabel="Publish poll">
        <Field label="Title *" value={form.title} onChangeText={(v: string) => setForm({ ...form, title: v })} />
        <Field label="Description" value={form.description} onChangeText={(v: string) => setForm({ ...form, description: v })} />
        <Field label="Target roles (comma-separated)" value={form.targetRoles} placeholder="parent,teacher" onChangeText={(v: string) => setForm({ ...form, targetRoles: v })} />

        {qs.map((q, qi) => (
          <View key={qi} style={styles.qCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Field label={`Question ${qi + 1} *`} value={q.text}
                  onChangeText={(v: string) => setQs(qs.map((x, j) => j === qi ? { ...x, text: v } : x))} />
              </View>
              {qs.length > 1 && (
                <TouchableOpacity onPress={() => setQs(qs.filter((_, j) => j !== qi))} style={{ paddingTop: 18 }}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              )}
            </View>
            {q.options.map((o, oi) => (
              <View key={oi} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Field placeholder={`Option ${oi + 1}`} value={o}
                    onChangeText={(v: string) => setQs(qs.map((x, j) => j === qi ? { ...x, options: x.options.map((y, k) => k === oi ? v : y) } : x))} />
                </View>
                {q.options.length > 2 && (
                  <TouchableOpacity onPress={() => setQs(qs.map((x, j) => j === qi ? { ...x, options: x.options.filter((_, k) => k !== oi) } : x))}>
                    <Ionicons name="close-circle-outline" size={18} color={colors.muted} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity onPress={() => setQs(qs.map((x, j) => j === qi ? { ...x, options: [...x.options, ''] } : x))}>
              <Text style={styles.link}>+ Add option</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity onPress={() => setQs([...qs, { text: '', options: ['', ''] }])}>
          <Text style={styles.link}>+ Add question</Text>
        </TouchableOpacity>
      </FormModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  desc: { ...font.body, color: colors.slate, marginBottom: spacing.sm },
  qText: { ...font.title, color: colors.ink, marginBottom: 6 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  optText: { ...font.body, color: colors.ink, flex: 1 },
  link: { ...font.label, color: colors.primary, fontWeight: '600', paddingVertical: 6 },
  resRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  resPct: { ...font.label, color: colors.slate, fontWeight: '700' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  qCard: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, gap: 4, marginTop: spacing.sm },
  mBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.line },
  mText: { fontSize: 13, fontWeight: '600', color: colors.ink },
});