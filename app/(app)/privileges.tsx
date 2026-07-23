import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/privileges';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, roleTheme, moduleColor } from '@/theme';
import { Screen, Loading, EmptyState } from '@/components/screen';
import { toast } from '@/components/toast';

type Cfg = { roles: string[]; isCustomized: boolean; default?: string[] };

export default function Privileges() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);
  const editable = can(user, 'user:manage');

  const [matrix, setMatrix] = useState<Record<string, Cfg>>({});
  const [roles, setRoles] = useState<string[]>([]);
  const [privileges, setPrivileges] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await API.get('/api/privileges');
      setMatrix(data.matrix ?? {});
      setRoles(data.availableRoles ?? []);
      setPrivileges(data.privileges ?? Object.keys(data.matrix ?? {}));
    } catch (e: any) { toast.error('Error', e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(priv: string, role: string) {
    if (!editable) return;
    const cur = matrix[priv];
    const has = cur.roles.includes(role);
    const nextRoles = has ? cur.roles.filter(r => r !== role) : [...cur.roles, role];
    // Optimistic update. Use functional setState so a concurrent toggle on a
    // different privilege isn't clobbered by this one's stale `matrix` copy.
    setMatrix(prev => ({ ...prev, [priv]: { ...cur, roles: nextRoles, isCustomized: true } }));
    setSavingKey(priv);
    try {
      await API.put(`/api/privileges/${encodeURIComponent(priv)}`, { roles: nextRoles });
    } catch (e: any) {
      toast.error('Save failed', e.message);
      setMatrix(prev => ({ ...prev, [priv]: cur }));  // revert only this row
    } finally { setSavingKey(null); }
  }

  async function resetRole(role: string) {
    const ok = await confirm({
      title: 'Reset role',
      message: `Reset all "${roleTheme[role]?.label ?? role}" privileges to defaults?`,
      confirmLabel: 'Reset', destructive: true,
    });
    if (!ok) return;
    try {
      const r = await API.post(`/api/privileges/role/${encodeURIComponent(role)}/reset`);
      toast.success('Role reset', `Reset ${r.privilegesTouched} privileges.`);
      load();
    } catch (e: any) { toast.error('Error', e.message); }
  }

  async function resetAll() {
    const ok = await confirm({
      title: 'Reset all',
      message: 'Reset the entire privilege matrix to defaults?',
      confirmLabel: 'Reset All', destructive: true,
    });
    if (!ok) return;
    try {
      await API.post('/api/privileges/reset-all');
      toast.success('Matrix reset', 'All roles are back to default privileges.');
      load();
    } catch (e: any) { toast.error('Error', e.message); }
  }

  if (loading) return <Screen title={t('nav.privileges', 'Privileges')} colors={rt.gradient} onBack={() => router.back()}><Loading /></Screen>;

  return (
    <Screen title={t('nav.privileges', 'Privileges')} subtitle={editable ? 'Tap to toggle' : 'Read only'}
      colors={rt.gradient} onBack={() => router.back()} scroll={false}
      right={editable ? <TouchableOpacity onPress={resetAll} style={styles.resetBtn}><Ionicons name="refresh" size={20} color={colors.ink} /></TouchableOpacity> : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {/* Role reset chips */}
        {editable && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: spacing.md }}>
            {roles.map(r => (
              <TouchableOpacity key={r} onPress={() => resetRole(r)} style={[styles.roleChip, { borderColor: roleTheme[r]?.accent ?? colors.primary }]}>
                <Ionicons name="refresh" size={12} color={roleTheme[r]?.accent ?? colors.primary} />
                <Text style={[styles.roleChipText, { color: roleTheme[r]?.accent ?? colors.primary }]}>{roleTheme[r]?.label ?? r}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {privileges.length === 0 && <EmptyState tint={moduleColor('privileges')} icon="shield" text="No privileges to configure." />}

        {privileges.map(priv => {
          const cfg = matrix[priv];
          if (!cfg) return null;
          return (
            <View key={priv} style={styles.privCard}>
              <View style={styles.privHead}>
                <Text style={styles.privName}>{priv}</Text>
                {cfg.isCustomized && <View style={styles.customDot} />}
                {savingKey === priv && <Text style={styles.saving}>saving…</Text>}
              </View>
              <View style={styles.roleGrid}>
                {roles.map(role => {
                  const on = cfg.roles.includes(role);
                  const tint = roleTheme[role]?.accent ?? colors.primary;
                  return (
                    <TouchableOpacity key={role} disabled={!editable} onPress={() => toggle(priv, role)}
                      style={[styles.roleTag, on ? { backgroundColor: tint } : { backgroundColor: colors.bg }]}>
                      <Text style={[styles.roleTagText, on ? { color: '#fff' } : { color: colors.muted }]}>
                        {(roleTheme[role]?.label ?? role).replace('School ', '')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  resetBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  roleChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.pill, borderWidth: 1.5 },
  roleChipText: { ...font.caption },
  privCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  privHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  privName: { ...font.title, color: colors.ink },
  customDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber },
  saving: { ...font.caption, color: colors.muted, marginLeft: 'auto' },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  roleTag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  roleTagText: { ...font.caption },
});