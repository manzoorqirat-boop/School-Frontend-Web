import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/privileges';
import { colors, spacing, font, radius, themeForRole, roleTheme } from '@/theme';
import { Screen, Field, FormModal, Avatar } from '@/components/screen';
import { useI18n } from '@/i18n';
import { toast } from '@/components/toast';


function passwordError(pw?: string): string | null {
  if (!pw) return 'Password is required';
  if (pw.length < 8) return 'At least 8 characters';
  if (!/[a-z]/.test(pw)) return 'Needs a lowercase letter';
  if (!/[A-Z]/.test(pw)) return 'Needs an uppercase letter';
  if (!/[0-9]/.test(pw)) return 'Needs a number';
  if (/^[a-zA-Z0-9]*$/.test(pw)) return 'Needs a special character (@ # $ !)';
  return null;
}

export default function Settings() {
  const router = useRouter();
  const { user, school, signOut } = useAuth();
  const rt = themeForRole(user?.role);
  const { lang, setLang, t } = useI18n();
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState<any>({});
  const [saving, setSaving] = useState(false);

  async function changePassword() {
    if (!pw.oldPassword || !pw.newPassword) { toast.error('Missing', 'Both fields are required.'); return; }
    const err = passwordError(pw.newPassword);
    if (err) { toast.error('Weak password', err); return; }
    if (pw.newPassword !== pw.confirm) { toast.error('Mismatch', 'New password and confirmation do not match.'); return; }
    setSaving(true);
    try {
      await API.post('/api/auth/change-password', { oldPassword: pw.oldPassword, newPassword: pw.newPassword });
      setPwOpen(false); setPw({});
      toast.success('Done', 'Password changed. You may need to sign in again.');
    } catch (e: any) { toast.error('Failed', e.message); }
    finally { setSaving(false); }
  }

  return (
    <Screen title={t('nav.settings', 'Settings')} subtitle={t('settings.subtitle', 'Profile & preferences')} colors={rt.gradient} onBack={() => router.back()}>
      {/* Profile card */}
      <View style={[styles.profile, { backgroundColor: colors.card }]}>
        <Avatar name={user?.name} tint={rt.accent} size={64} />
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.role}>{roleTheme[user?.role ?? '']?.label ?? user?.role}</Text>
        {school?.name ? <Text style={styles.school}>{school.name}</Text> : null}
      </View>

      {/* Language */}
      <Text style={styles.section}>{t('settings.language', 'Language')}</Text>
      <View style={styles.langRow}>
        {(['en', 'hi'] as const).map(l => {
          const on = lang === l;
          return (
            <TouchableOpacity key={l} onPress={() => setLang(l)}
              style={[styles.langBtn, on && { backgroundColor: rt.accent }]}>
              <Text style={[styles.langText, on && { color: '#fff' }]}>{l === 'en' ? 'English' : 'हिन्दी'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Administration */}
      {can(user, 'school:settings') && (
        <>
          <Text style={styles.section}>{t('settings.administration', 'Administration')}</Text>
          <Row icon="business" label={t('settings.schoolSetup', 'School setup')} onPress={() => router.push('/(app)/school-setup')} />
          <Row icon="shield-checkmark" label={t('nav.privileges', 'Roles & privileges')} onPress={() => router.push('/(app)/privileges')} />
        </>
      )}

      {/* Actions */}
      <Text style={styles.section}>{t('settings.account', 'Account')}</Text>
      <Row icon="key" label={t('settings.changePassword', 'Change password')} onPress={() => setPwOpen(true)} />
      <Row icon="log-out" label={t('nav.logout', 'Sign out')} tint={colors.danger} onPress={async () => {
        const ok = await confirm({
          title: 'Sign out', message: 'Are you sure?',
          confirmLabel: 'Sign out', destructive: true,
        });
        if (ok) signOut();
      }} />

      <Text style={styles.version}>QMSoft School · v1.0.0</Text>

      <FormModal visible={pwOpen} title="Change password" onClose={() => setPwOpen(false)}
        onSubmit={changePassword} submitting={saving} submitLabel="Update">
        <Field label="Current password" value={pw.oldPassword} secureTextEntry onChangeText={(v: string) => setPw({ ...pw, oldPassword: v })} />
        <Field label="New password" value={pw.newPassword} secureTextEntry onChangeText={(v: string) => setPw({ ...pw, newPassword: v })} />
        <Field label="Confirm new password" value={pw.confirm} secureTextEntry onChangeText={(v: string) => setPw({ ...pw, confirm: v })} />
      </FormModal>
    </Screen>
  );
}

function Row({ icon, label, tint = colors.ink, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.row}>
      <Ionicons name={icon} size={20} color={tint} />
      <Text style={[styles.rowLabel, { color: tint }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: 'center', gap: 4, padding: spacing.xl, borderRadius: radius.lg, marginBottom: spacing.lg },
  name: { ...font.h3, color: colors.ink, marginTop: spacing.sm },
  role: { ...font.label, color: colors.slate },
  school: { ...font.label, color: colors.muted },
  section: { ...font.title, color: colors.slate, marginTop: spacing.md, marginBottom: spacing.sm },
  langRow: { flexDirection: 'row', gap: spacing.sm },
  langBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.card, alignItems: 'center' },
  langText: { ...font.title, color: colors.slate },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card,
    borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.sm },
  rowLabel: { ...font.title, flex: 1 },
  version: { ...font.label, color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
});