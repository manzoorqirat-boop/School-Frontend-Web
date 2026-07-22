import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSchoolConfig } from '@/lib/schoolConfig';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, ListItem, EmptyState, Loading, Field, ChipPicker, FormModal } from '@/components/screen';

const ADMINISH = ['school_admin', 'principal', 'superadmin'];

// Teachers: shows YOUR class assignments (these gate attendance marking).
// Admins: manage ALL assignments — without one, a teacher gets 403 on rosters.
export default function MyClasses() {
  const router = useRouter();
  const { user } = useAuth();
  const { classes, sections } = useSchoolConfig();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);
  const isAdmin = ADMINISH.includes(user?.role ?? '');

  const [items, setItems] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<any>({});

  const load = useCallback(async () => {
    try {
      const data = await API.get(isAdmin ? '/api/class-teachers' : '/api/class-teachers/my-classes');
      setItems(data.items ?? []);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }, [isAdmin]);
  useEffect(() => { load(); }, [load]);

  async function openCreate() {
    setForm({ class: '1', section: 'A' });
    setFormOpen(true);
    if (!teachers.length) {
      try { const d = await API.get('/api/users?role=teacher&limit=100'); setTeachers(d.items ?? []); } catch {}
    }
  }

  async function save() {
    if (!form.teacherUserId) { Alert.alert('Missing', 'Select a teacher.'); return; }
    setSaving(true);
    try {
      const created = await API.post('/api/class-teachers', {
        teacherUserId: form.teacherUserId, class: form.class, section: form.section,
        subject: form.subject?.trim() || null,
      });
      setItems(prev => [created, ...prev]);
      setFormOpen(false);
    } catch (e: any) { Alert.alert('Failed', e.message); }
    finally { setSaving(false); }
  }

  function confirmDelete(a: any) {
    Alert.alert('Remove assignment', `Remove this assignment? The teacher will lose attendance-marking rights for ${a.class}-${a.section}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await API.del(`/api/class-teachers/${a._id}`); setItems(prev => prev.filter(x => x._id !== a._id)); }
        catch (e: any) { Alert.alert('Failed', e.message); }
      }},
    ]);
  }

  const teacherName = (a: any) => a.teacherName ?? teachers.find(x => x._id === a.teacherUserId)?.name ?? '';

  if (loading) return <Screen title={t('nav.myClasses', 'My Classes')} colors={rt.gradient} onBack={() => router.back()}><Loading /></Screen>;

  return (
    <Screen title={isAdmin ? 'Class Teachers' : t('nav.myClasses', 'My Classes')}
      subtitle={isAdmin ? 'Assignments gate attendance marking' : `${items.length} assignment(s)`}
      colors={rt.gradient} onBack={() => router.back()} scroll={false}
      right={isAdmin ? <TouchableOpacity onPress={openCreate} style={[styles.hBtn, { backgroundColor: moduleColor('my-classes'), borderColor: moduleColor('my-classes') }]}><Ionicons name="add" size={22} color="#fff" /></TouchableOpacity> : undefined}>
      <FlatList
        data={items}
        keyExtractor={a => a._id}
        contentContainerStyle={{ padding: spacing.lg }}
        ListEmptyComponent={
          <EmptyState tint={moduleColor('my-classes')} icon="easel"
            text={isAdmin
              ? 'No class-teacher assignments. Teachers cannot mark attendance until assigned — use + to assign.'
              : 'No classes assigned to you yet. Ask your admin to assign you — you need an assignment to mark attendance.'} />
        }
        renderItem={({ item: a }) => (
          <View style={styles.row}>
            <View style={[styles.badge, { backgroundColor: rt.accent + '18' }]}>
              <Text style={[styles.badgeText, { color: rt.accent }]}>{a.class}-{a.section}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{isAdmin ? (teacherName(a) || 'Teacher') : `Class ${a.class} · Section ${a.section}`}</Text>
              <Text style={styles.sub}>{a.subject ? `Subject: ${a.subject}` : 'Homeroom (all subjects)'}{a.academicYear ? ` · ${a.academicYear}` : ''}</Text>
            </View>
            {isAdmin && (
              <TouchableOpacity onPress={() => confirmDelete(a)} style={{ padding: 6 }}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </TouchableOpacity>
            )}
          </View>
        )}
      />

      <FormModal visible={formOpen} title="Assign class teacher" onClose={() => setFormOpen(false)}
        onSubmit={save} submitting={saving} submitLabel="Assign">
        <Text style={styles.pickLabel}>Teacher *</Text>
        {teachers.length === 0 && <Text style={styles.hint}>Loading teachers…</Text>}
        <View style={{ maxHeight: 150 }}>
          <ScrollView>
            {teachers.map(tc => (
              <TouchableOpacity key={tc._id} style={styles.teachRow} onPress={() => setForm({ ...form, teacherUserId: tc._id })}>
                <Ionicons name={form.teacherUserId === tc._id ? 'radio-button-on' : 'radio-button-off'} size={18}
                  color={form.teacherUserId === tc._id ? colors.primary : colors.muted} />
                <Text style={styles.teachName}>{tc.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <ChipPicker label="Class" options={classes} value={form.class} onChange={(v) => setForm({ ...form, class: v })} />
        <ChipPicker label="Section" options={sections} value={form.section} onChange={(v) => setForm({ ...form, section: v })} />
        <Field label="Subject (blank = homeroom)" value={form.subject} placeholder="e.g. Maths" onChangeText={(v: string) => setForm({ ...form, subject: v })} />
      </FormModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.sm },
  badge: { minWidth: 52, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  badgeText: { ...font.title },
  title: { ...font.title, color: colors.ink },
  sub: { ...font.label, color: colors.muted, marginTop: 1 },
  pickLabel: { ...font.label, color: colors.slate },
  teachRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  teachName: { ...font.body, color: colors.ink },
  hint: { ...font.label, color: colors.muted, fontStyle: 'italic' },
});