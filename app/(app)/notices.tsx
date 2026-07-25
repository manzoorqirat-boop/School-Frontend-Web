import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/privileges';
import { useSchoolConfig } from '@/lib/schoolConfig';
import { colors, spacing, font, radius, moduleColor } from '@/theme';
import { Screen, EmptyState, Loading, Field, ChipPicker, DateField, FormModal } from '@/components/screen';
import { MAX_W } from '@/components/responsive';
import { useToast } from '@/components/toast';

const PRIORITY_TINT: Record<string, string> = {
  normal: colors.muted,
  important: colors.warning,
  urgent: colors.danger,
};

const PRIORITIES = ['normal', 'important', 'urgent'];

// Mirrors ck_notices_target_roles. superadmin is deliberately absent — it is
// not a targetable audience, it sees everything regardless.
const TARGETABLE_ROLES = [
  'parent', 'teacher', 'student', 'school_admin', 'principal', 'accountant',
];

const ROLE_LABEL: Record<string, string> = {
  parent: 'Parents', teacher: 'Teachers', student: 'Students',
  school_admin: 'Admins', principal: 'Principal', accountant: 'Accounts',
};

export default function Notices() {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const canManage = can(user, 'notice:manage');
  // Aliased: `classes` here is the SCHOOL'S configured class list, distinct
  // from targetClasses (this notice's selection). Same source every other
  // screen uses, so the values are guaranteed to match Student.Class.
  const { classes: schoolClasses } = useSchoolConfig();
  const tint = moduleColor('notices');

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('normal');
  const [roles, setRoles] = useState<string[]>([]);
  const [targetClasses, setTargetClasses] = useState<string[]>([]);
  const [publishAt, setPublishAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [pinned, setPinned] = useState(false);

  const load = useCallback(async () => {
    try {
      // includeExpired only does anything for admin roles server-side; sending
      // it unconditionally keeps one code path for both.
      const data = await API.get<any>('/api/notices?includeExpired=true');
      setItems(Array.isArray(data) ? data : data.items ?? []);
    } catch (e: any) {
      toast.error('Could not load notices', e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  function reset() {
    setEditing(null);
    setTitle(''); setBody(''); setPriority('normal');
    setRoles([]); setTargetClasses([]); setPublishAt(''); setExpiresAt(''); setPinned(false);
  }

  function openCreate() { reset(); setOpen(true); }

  function openEdit(n: any) {
    setEditing(n);
    setTitle(n.title ?? '');
    setBody(n.body ?? '');
    setPriority(n.priority ?? 'normal');
    setRoles(n.targetRoles ?? []);
    setTargetClasses(n.targetClasses ?? []);
    setPublishAt(n.publishAt ?? '');
    setExpiresAt(n.expiresAt ?? '');
    setPinned(!!n.isPinned);
    setOpen(true);
  }

  function toggleRole(r: string) {
    setRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  }

  function toggleClass(c: string) {
    setTargetClasses(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  }

  async function save() {
    if (!title.trim()) { Alert.alert('Missing title', 'Give the notice a title.'); return; }
    if (!body.trim()) { Alert.alert('Missing body', 'Write the notice text.'); return; }

    const payload = {
      title: title.trim(),
      body: body.trim(),
      priority,
      // Empty array = everyone. That is the server's rule, not a placeholder.
      targetRoles: roles,
      targetClasses,
      publishAt: publishAt || null,
      expiresAt: expiresAt || null,
      isPinned: pinned,
    };

    setSaving(true);
    try {
      if (editing) await API.put(`/api/notices/${editing._id}`, payload);
      else await API.post('/api/notices', payload);
      toast.success(editing ? 'Notice updated' : 'Notice posted');
      setOpen(false);
      reset();
      await load();
    } catch (e: any) {
      toast.error('Could not save', e.message);
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(n: any) {
    Alert.alert('Delete notice', `Remove "${n.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await API.del(`/api/notices/${n._id}`);
            toast.success('Notice removed');
            await load();
          } catch (e: any) {
            toast.error('Could not delete', e.message);
          }
        },
      },
    ]);
  }

  function audienceLine(n: any) {
    const r = (n.targetRoles ?? []).length
      ? (n.targetRoles as string[]).map(x => ROLE_LABEL[x] ?? x).join(', ')
      : 'Everyone';
    const c = (n.targetClasses ?? []).length
      ? ` · ${(n.targetClasses as string[]).join(', ')}`
      : '';
    return r + c;
  }

  // A notice can be saved with a future publish date or a past expiry. Without
  // a marker an admin cannot tell those apart from a live one in the list.
  function stateOf(n: any): { label: string; tint: string } | null {
    const now = Date.now();
    if (n.publishAt && new Date(n.publishAt).getTime() > now)
      return { label: 'Scheduled', tint: colors.info };
    if (n.expiresAt && new Date(n.expiresAt).getTime() <= now)
      return { label: 'Expired', tint: colors.muted };
    return null;
  }

  if (loading) return <Loading />;

  return (
    <Screen
      title="Notice Board"
      onBack={() => router.back()}
      scroll={false}
      // Reading column, not the 1100px data width — notice bodies are prose
      // and long lines are hard to scan.
      maxWidth={MAX_W.form}
      right={canManage ? (
        <TouchableOpacity onPress={openCreate} hitSlop={8}>
          <Ionicons name="add-circle" size={26} color={tint} />
        </TouchableOpacity>
      ) : undefined}
    >
      <FlatList
        data={items}
        keyExtractor={(n: any) => n._id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListEmptyComponent={
          <EmptyState
            tint={tint}
            icon="megaphone"
            text={canManage ? 'No notices yet. Use + to post one.' : 'No notices right now.'}
          />
        }
        renderItem={({ item: n }) => {
          const state = stateOf(n);
          return (
            <TouchableOpacity
              activeOpacity={canManage ? 0.85 : 1}
              onPress={canManage ? () => openEdit(n) : undefined}
              onLongPress={canManage ? () => confirmDelete(n) : undefined}
              style={[
                styles.card,
                n.priority === 'urgent' && { borderColor: colors.danger + '66' },
              ]}
            >
              <View style={styles.cardHead}>
                {n.isPinned ? (
                  <Ionicons name="pin" size={14} color={tint} style={{ marginTop: 2 }} />
                ) : null}
                <Text style={styles.cardTitle}>{n.title}</Text>
                {n.priority && n.priority !== 'normal' ? (
                  <View style={[styles.pill, { backgroundColor: PRIORITY_TINT[n.priority] + '18' }]}>
                    <Text style={[styles.pillText, { color: PRIORITY_TINT[n.priority] }]}>
                      {n.priority}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.cardBody}>{n.body}</Text>

              <View style={styles.metaRow}>
                <Ionicons name="people-outline" size={12} color={colors.muted} />
                <Text style={styles.meta} numberOfLines={1}>{audienceLine(n)}</Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.meta}>
                  {n.createdByName ? `${n.createdByName} · ` : ''}
                  {new Date(n.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </Text>
                {state ? (
                  <View style={[styles.pill, { backgroundColor: state.tint + '18' }]}>
                    <Text style={[styles.pillText, { color: state.tint }]}>{state.label}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <FormModal
        visible={open}
        title={editing ? 'Edit notice' : 'New notice'}
        onClose={() => { setOpen(false); reset(); }}
        onSubmit={save}
        submitLabel={editing ? 'Save' : 'Post'}
        submitting={saving}
      >
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Half-day on Friday" />
        <Field
          label="Notice" value={body} onChangeText={setBody} multiline
          placeholder="Write the full notice here…"
        />

        <ChipPicker label="Priority" options={PRIORITIES} value={priority} onChange={setPriority} />

        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Who sees it</Text>
          <Text style={styles.hint}>Select none to show it to everyone.</Text>
          <View style={styles.roleWrap}>
            {TARGETABLE_ROLES.map(r => {
              const on = roles.includes(r);
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => toggleRole(r)}
                  style={[styles.roleChip, on && { backgroundColor: tint, borderColor: tint }]}
                >
                  <Text style={[styles.roleChipText, on && { color: '#fff' }]}>
                    {ROLE_LABEL[r] ?? r}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Classes</Text>
          <Text style={styles.hint}>
            Select none for all classes. Only students and parents are filtered by
            class — staff always see the notice.
          </Text>
          <View style={styles.roleWrap}>
            {schoolClasses.map(c => {
              const on = targetClasses.includes(c);
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => toggleClass(c)}
                  style={[styles.roleChip, on && { backgroundColor: tint, borderColor: tint }]}
                >
                  <Text style={[styles.roleChipText, on && { color: '#fff' }]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <DateField label="Publish on" value={publishAt} onChange={setPublishAt} placeholder="Immediately" />
        <DateField label="Expires on" value={expiresAt} onChange={setExpiresAt} placeholder="Never" />

        <TouchableOpacity style={styles.pinRow} onPress={() => setPinned(p => !p)}>
          <Ionicons
            name={pinned ? 'checkbox' : 'square-outline'}
            size={20}
            color={pinned ? tint : colors.muted}
          />
          <Text style={styles.pinLabel}>Pin to the top of the board</Text>
        </TouchableOpacity>

        {editing && canManage ? (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => { setOpen(false); confirmDelete(editing); }}
          >
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={styles.deleteText}>Delete this notice</Text>
          </TouchableOpacity>
        ) : null}
      </FormModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.line, padding: spacing.lg, gap: 6,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  cardTitle: { ...font.title, color: colors.ink, flex: 1 },
  cardBody: { ...font.body, color: colors.slate, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  meta: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0, flexShrink: 1 },

  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  pillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },

  label: { ...font.label, color: colors.ink, fontWeight: '600' },
  hint: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0 },

  roleWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
  },
  roleChipText: { ...font.body, color: colors.slate, fontSize: 13 },

  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  pinLabel: { ...font.body, color: colors.ink },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.danger + '44',
  },
  deleteText: { ...font.body, color: colors.danger, fontWeight: '600' },
});
