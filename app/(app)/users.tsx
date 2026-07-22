import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/privileges';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, roleLabel, moduleColor } from '@/theme';
import { Screen, SearchBar, ListItem, Avatar, EmptyState, Loading, Field, ChipPicker, FormModal } from '@/components/screen';

const ROLES = ['school_admin', 'principal', 'accountant', 'teacher', 'parent', 'student'];

// Mirrors the backend PasswordPolicy — same rules, same order, so the first
// client error matches what the server would have said.
function passwordError(pw?: string): string | null {
  if (!pw) return 'Password is required';
  if (pw.length < 8) return 'At least 8 characters';
  if (pw.length > 128) return 'Too long (max 128)';
  if (!/[a-z]/.test(pw)) return 'Needs a lowercase letter';
  if (!/[A-Z]/.test(pw)) return 'Needs an uppercase letter';
  if (!/[0-9]/.test(pw)) return 'Needs a number';
  if (/^[a-zA-Z0-9]*$/.test(pw)) return 'Needs a special character (@ # $ !)';
  return null;
}

export default function Users() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);
  const manage = can(user, 'user:manage');

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [fRole, setFRole] = useState('');

  const [view, setView] = useState<any>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [resetFor, setResetFor] = useState<any>(null);
  const [resetPw, setResetPw] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [kids, setKids] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { const data = await API.get('/api/users?limit=500'); setUsers(data.items ?? []); }
    catch (e: any) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = users;
    if (fRole) list = list.filter(u => u.role === fRole);
    if (q.trim()) {
      const tt = q.toLowerCase();
      list = list.filter(u => [u.name, u.username, u.email, u.phone].filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(tt)));
    }
    return list;
  }, [users, q, fRole]);

  async function loadStudents() {
    if (students.length) return;
    try { const data = await API.get('/api/students?limit=2000'); setStudents(data.items ?? []); } catch {}
  }

  // ── Create / edit ───────────────────────────────────────────────────────
  function openCreate() {
    setEditing(null);
    setForm({ role: 'teacher' });
    setKids([]);
    setFormOpen(true);
  }
  function openEdit(u: any) {
    setEditing(u);
    setForm({ name: u.name, email: u.email ?? '', phone: u.phone ?? '', role: u.role, isActive: u.isActive !== false });
    setKids((u.parentOf ?? []).map((s: any) => s._id ?? s));
    if (u.role === 'parent') loadStudents();
    setView(null);
    setFormOpen(true);
  }

  async function save() {
    if (!form.name?.trim()) { Alert.alert('Missing', 'Name is required.'); return; }
    setSaving(true);
    try {
      if (editing) {
        const updated = await API.put(`/api/users/${editing._id}`, {
          name: form.name.trim(), email: form.email || null, phone: form.phone || null,
          isActive: form.isActive,
          parentOf: editing.role === 'parent' ? kids : undefined,
        });
        setUsers(prev => prev.map(x => x._id === editing._id ? updated : x));
      } else {
        if (!form.username?.trim()) { Alert.alert('Missing', 'Username is required.'); setSaving(false); return; }
        const pwErr = passwordError(form.password);
        if (pwErr) { Alert.alert('Weak password', pwErr); setSaving(false); return; }
        const created = await API.post('/api/users', {
          username: form.username.trim(), password: form.password, name: form.name.trim(),
          role: form.role, email: form.email || undefined, phone: form.phone || undefined,
          parentOf: form.role === 'parent' && kids.length ? kids : undefined,
        });
        setUsers(prev => [created, ...prev]);
      }
      setFormOpen(false);
    } catch (e: any) { Alert.alert('Save failed', e.message); }
    finally { setSaving(false); }
  }

  // ── Reset password (cross-platform modal — Alert.prompt is iOS-only) ────
  function openReset(u: any) { setView(null); setResetFor(u); setResetPw(''); }
  async function doReset() {
    const err = passwordError(resetPw);
    if (err) { Alert.alert('Weak password', err); return; }
    setSaving(true);
    try {
      await API.post(`/api/users/${resetFor._id}/reset-password`, { newPassword: resetPw });
      setResetFor(null);
      Alert.alert('Password reset', `${resetFor.name} will be signed out of all devices and must log in with the new password.`);
    } catch (e: any) { Alert.alert('Failed', e.message); }
    finally { setSaving(false); }
  }

  function deactivate(u: any) {
    Alert.alert('Deactivate user', `Deactivate ${u.name}? They will no longer be able to log in.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: async () => {
        try { await API.del(`/api/users/${u._id}`); setUsers(prev => prev.map(x => x._id === u._id ? { ...x, isActive: false } : x)); setView(null); }
        catch (e: any) { Alert.alert('Failed', e.message); }
      }},
    ]);
  }

  function toggleKid(id: string) {
    setKids(prev => prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]);
  }

  const pwHint = !editing && form.password ? passwordError(form.password) : null;

  if (loading) return <Screen title={t('nav.users', 'Users')} colors={rt.gradient} onBack={() => router.back()}><Loading /></Screen>;

  return (
    <Screen title={t('nav.users', 'Users')} subtitle={`${filtered.length} of ${users.length}`}
      colors={rt.gradient} onBack={() => router.back()} scroll={false}
      right={manage ? <TouchableOpacity onPress={openCreate} style={[styles.addBtn, { backgroundColor: moduleColor('users'), borderColor: moduleColor('users') }]}><Ionicons name="add" size={22} color="#fff" /></TouchableOpacity> : undefined}>
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <SearchBar value={q} onChangeText={setQ} placeholder="Name, username, email…" />
        <ChipPicker label="Role" options={['', ...ROLES]} value={fRole} onChange={setFRole} />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={u => u._id}
        contentContainerStyle={{ padding: spacing.lg }}
        ListEmptyComponent={<EmptyState tint={moduleColor('users')} icon="people" text="No users match." />}
        renderItem={({ item: u }) => (
          <ListItem
            leading={<Avatar name={u.name} tint={rt.accent} />}
            title={u.name}
            subtitle={`@${u.username} · ${roleLabel(u.role)}`}
            badge={u.isActive === false ? 'inactive' : 'active'}
            badgeTint={u.isActive === false ? colors.muted : colors.success}
            onPress={() => setView(u)}
          />
        )}
      />

      {/* Detail */}
      <FormModal visible={!!view} title={view?.name ?? ''} onClose={() => setView(null)}
        onSubmit={() => setView(null)} submitLabel="Close">
        {view && (
          <View style={{ gap: 6 }}>
            <Row k="Username" v={`@${view.username}`} />
            <Row k="Role" v={roleLabel(view.role)} />
            <Row k="Email" v={view.email} />
            <Row k="Phone" v={view.phone} />
            {view.role === 'parent' && <Row k="Children" v={(view.parentOf ?? []).map((s: any) => s.firstName ?? '').filter(Boolean).join(', ') || '—'} />}
            <Row k="Status" v={view.isActive === false ? 'Inactive' : 'Active'} />
            {manage && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
                <ActBtn icon="pencil-outline" label="Edit" onPress={() => openEdit(view)} />
                <ActBtn icon="key-outline" label="Reset password" onPress={() => openReset(view)} />
                {view.isActive !== false && view._id !== user?._id && (
                  <ActBtn icon="ban-outline" label="Deactivate" danger onPress={() => deactivate(view)} />
                )}
              </View>
            )}
          </View>
        )}
      </FormModal>

      {/* Create / edit */}
      <FormModal visible={formOpen} title={editing ? `Edit · ${editing.name}` : 'New user'} onClose={() => setFormOpen(false)}
        onSubmit={save} submitting={saving} submitLabel={editing ? 'Update' : 'Create'}>
        <Field label="Full name *" value={form.name} onChangeText={(v: string) => setForm({ ...form, name: v })} />
        {!editing && (
          <>
            <Field label="Username *" value={form.username} autoCapitalize="none" onChangeText={(v: string) => setForm({ ...form, username: v })} />
            <Field label="Password *" value={form.password} secureTextEntry onChangeText={(v: string) => setForm({ ...form, password: v })} />
            <Text style={[styles.pwHint, { color: pwHint ? colors.danger : colors.success }]}>
              {form.password ? (pwHint ?? '✓ Meets password policy') : '8+ chars with upper, lower, number & special'}
            </Text>
            <ChipPicker label="Role" options={ROLES} value={form.role ?? 'teacher'}
              onChange={(v) => { setForm({ ...form, role: v }); if (v === 'parent') loadStudents(); }} />
          </>
        )}
        {editing && <ChipPicker label="Status" options={['active', 'inactive']} value={form.isActive ? 'active' : 'inactive'}
          onChange={(v) => setForm({ ...form, isActive: v === 'active' })} />}
        <Field label="Email" value={form.email} autoCapitalize="none" onChangeText={(v: string) => setForm({ ...form, email: v })} />
        <Field label="Phone" value={form.phone} keyboardType="phone-pad" onChangeText={(v: string) => setForm({ ...form, phone: v })} />

        {/* Parent → children linking */}
        {((form.role === 'parent') || (editing?.role === 'parent')) && (
          <>
            <Text style={styles.subHead}>Children · tap to link ({kids.length} selected)</Text>
            {students.length === 0 && <Text style={styles.hint}>Loading students…</Text>}
            {students.slice(0, 200).map(s => {
              const on = kids.includes(s._id);
              return (
                <TouchableOpacity key={s._id} onPress={() => toggleKid(s._id)} style={styles.kidRow}>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.primary : colors.muted} />
                  <Text style={styles.kidName}>{s.firstName} {s.lastName ?? ''} · {s.class}-{s.section}</Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </FormModal>

      {/* Reset password — proper modal, works on Android AND iOS */}
      <FormModal visible={!!resetFor} title={`Reset password · ${resetFor?.name ?? ''}`}
        onClose={() => setResetFor(null)} onSubmit={doReset} submitting={saving} submitLabel="Reset">
        <Field label="New password *" value={resetPw} secureTextEntry onChangeText={setResetPw} />
        <Text style={[styles.pwHint, { color: resetPw ? (passwordError(resetPw) ? colors.danger : colors.success) : colors.muted }]}>
          {resetPw ? (passwordError(resetPw) ?? '✓ Meets password policy') : '8+ chars with upper, lower, number & special'}
        </Text>
        <Text style={styles.hint}>The user will be signed out of all devices.</Text>
      </FormModal>
    </Screen>
  );
}

function Row({ k, v }: { k: string; v?: any }) {
  return <View style={styles.row}><Text style={styles.rowK}>{k}</Text><Text style={styles.rowV}>{v || '—'}</Text></View>;
}
function ActBtn({ icon, label, onPress, danger }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.actBtn, danger && { borderColor: colors.danger + '55' }]}>
      <Ionicons name={icon} size={15} color={danger ? colors.danger : colors.ink} />
      <Text style={[styles.actText, danger && { color: colors.danger }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 12 },
  rowK: { ...font.label, color: colors.muted },
  rowV: { ...font.body, color: colors.ink, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.line },
  actText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  pwHint: { ...font.caption, textTransform: 'none', letterSpacing: 0 },
  subHead: { ...font.title, color: colors.ink, marginTop: spacing.sm },
  kidRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  kidName: { ...font.body, color: colors.ink },
  hint: { ...font.label, color: colors.muted, fontStyle: 'italic' },
});