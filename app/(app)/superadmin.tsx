import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { API } from '@/lib/api';
import { themeForRole, colors, spacing, font, radius, moduleColor } from '@/theme';
import { GradientHeader, StatTile, Card, Chip } from '@/components/ui';
import { Field, ChipPicker, FormModal } from '@/components/screen';
import { Ionicons } from '@expo/vector-icons';
import { toast } from '@/components/toast';

export default function Superadmin() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const rt = themeForRole('superadmin');
  const [schools, setSchools] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const data = await API.get<any[]>('/api/schools'); setSchools(Array.isArray(data) ? data : []); } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const active = schools.filter(s => s.isActive).length;

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<any>({ type: 'k12' });
  const [saving, setSaving] = useState(false);

  async function createSchool() {
    if (!form.name || !form.slug || !form.adminUsername || !form.adminPassword) {
      toast.error('Missing', 'School name, code, admin username and password are required.');
      return;
    }
    if (!/^[a-z0-9-]+$/.test(String(form.slug).toLowerCase())) {
      toast.error('Invalid code', 'School code can only contain lowercase letters, numbers and hyphens (it becomes the login code).');
      return;
    }
    const pw = form.adminPassword;
    const pwBad = pw.length < 8 || !/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw) || /^[a-zA-Z0-9]*$/.test(pw);
    if (pwBad) { toast.error('Weak password', 'Admin password needs 8+ chars with upper, lower, number & special character.'); return; }
    setSaving(true);
    try {
      const res = await API.post('/api/schools', form);
      setSchools(prev => [res.school, ...prev]);
      setFormOpen(false);
      setForm({ type: 'k12' });
      toast.success('School created', `Admin login: ${res.admin?.username}`);
    } catch (e: any) { toast.error('Create failed', e.message); }
    finally { setSaving(false); }
  }

  async function confirmDeactivate(sch: any) {
    const ok = await confirm({
      title: 'Deactivate school',
      message: `Deactivate "${sch.name}"? Its users will no longer be able to log in.`,
      confirmLabel: 'Deactivate', destructive: true,
    });
    if (!ok) return;
    try {
      await API.del(`/api/schools/${sch._id}`);
      setSchools(prev => prev.map(x => x._id === sch._id ? { ...x, isActive: false } : x));
      toast.success('School deactivated', `"${sch.name}" can no longer sign in.`);
    } catch (e: any) { toast.error('Failed', e.message); }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={rt.accent} />}>
      <GradientHeader colors={rt.gradient} subtitle={rt.label} title="Schools"
        right={<View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => setFormOpen(true)} style={styles.avatar}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={signOut} style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name ?? 'U').slice(0,2).toUpperCase()}</Text>
          </TouchableOpacity>
        </View>} />
      <View style={styles.statRow}>
        <StatTile label="Total Schools" value={schools.length} icon="business" tint={colors.amber} />
        <StatTile label="Active" value={active} icon="checkmark-circle" tint={colors.emerald} />
      </View>
      <Text style={styles.section}>All schools</Text>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
        {schools.map(s => (
          <TouchableOpacity key={s._id} onLongPress={() => confirmDeactivate(s)} activeOpacity={0.85}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.schoolName}>{s.name}</Text>
                <Text style={styles.slug}>{s.slug} · {s.type?.toUpperCase?.()}</Text>
              </View>
              <Chip label={s.isActive ? 'Active' : 'Inactive'} tint={s.isActive ? colors.emerald : colors.danger} />
            </View>
          </Card>
          </TouchableOpacity>
        ))}
        {schools.length === 0 && <Text style={styles.empty}>No schools yet. Pull to refresh.</Text>}
      </View>

      <FormModal visible={formOpen} title="New school" onClose={() => setFormOpen(false)}
        onSubmit={createSchool} submitting={saving} submitLabel="Create School">
        <Field label="School name *" value={form.name} onChangeText={(v: string) => setForm({ ...form, name: v })} />
        <Field label="School code (slug) *" value={form.slug} autoCapitalize="none"
          onChangeText={(v: string) => setForm({ ...form, slug: v.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
        <ChipPicker label="Type" options={['k12', 'primary', 'secondary', 'college']} value={form.type ?? 'k12'} onChange={(v) => setForm({ ...form, type: v })} />
        <Field label="Email" value={form.email} autoCapitalize="none" onChangeText={(v: string) => setForm({ ...form, email: v })} />
        <Field label="Phone" value={form.phone} keyboardType="phone-pad" onChangeText={(v: string) => setForm({ ...form, phone: v })} />
        <Text style={styles.formSection}>First admin account</Text>
        <Field label="Admin username *" value={form.adminUsername} autoCapitalize="none" onChangeText={(v: string) => setForm({ ...form, adminUsername: v })} />
        <Field label="Admin password *" value={form.adminPassword} secureTextEntry onChangeText={(v: string) => setForm({ ...form, adminPassword: v })} />
        <Field label="Admin display name" value={form.adminName} onChangeText={(v: string) => setForm({ ...form, adminName: v })} />
      </FormModal>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  avatar: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  statRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xl, marginTop: -spacing.lg },
  section: { ...font.h3, color: colors.ink, paddingHorizontal: spacing.xl, marginTop: spacing.xl, marginBottom: spacing.md },
  schoolName: { ...font.title, color: colors.ink },
  slug: { ...font.label, color: colors.muted, marginTop: 2 },
  empty: { ...font.body, color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
  formSection: { ...font.title, color: colors.primary, marginTop: spacing.sm },
});