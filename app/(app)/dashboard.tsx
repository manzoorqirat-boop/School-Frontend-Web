import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n';
import { API } from '@/lib/api';
import { colors, spacing, font, radius, roleAccent, roleLabel, moduleColor } from '@/theme';
import { Container, useGridColumns, gridItemWidth } from '@/components/responsive';

export default function Dashboard() {
  const { user, school, signOut } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accent = roleAccent(user?.role);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<{ students?: number; feesOutstanding?: number }>({});

  // 3 tiles on a phone, more as the window grows — a fixed 31% would render
  // ~600px squares on a desktop.
  const cols = useGridColumns({ phone: 3, tablet: 4, desktop: 6 });
  const tileW = gridItemWidth(cols);

  const load = useCallback(async () => {
    try {
      const [s, f] = await Promise.allSettled([
        API.get('/api/students?limit=1'),
        API.get('/api/invoices/reports/summary'),
      ]);
      const next: any = {};
      if (s.status === 'fulfilled') next.students = s.value?.pagination?.total ?? s.value?.count;
      if (f.status === 'fulfilled') next.feesOutstanding = f.value?.outstanding;
      setStats(next);
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const r = user?.role ?? '';
  const can = (p: string) => {
    if (r === 'superadmin' || r === 'school_admin') return true;
    if (r === 'principal') return p !== 'users';
    if (r === 'accountant') return ['fees', 'payroll'].includes(p);
    if (r === 'teacher') return ['attendance', 'marks', 'my-classes'].includes(p);
    return false;
  };

  const initials = (user?.name ?? 'U').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

  const actions: { key: string; label: string; icon: any; route: string; show: boolean }[] = [
    { key: 'students', label: t('nav.students', 'Students'), icon: 'people-outline', route: '/(app)/students', show: true },
    { key: 'promote', label: t('nav.promote', 'Promote'), icon: 'trending-up-outline', route: '/(app)/promote', show: r === 'superadmin' || r === 'school_admin' || r === 'principal' },
    { key: 'attendance', label: t('nav.attendance', 'Attendance'), icon: 'checkbox-outline', route: '/(app)/attendance', show: true },
    { key: 'staff-attendance', label: t('nav.staffAttendance', 'Staff Attendance'), icon: 'briefcase-outline', route: '/(app)/teacher-attendance', show: r === 'superadmin' || r === 'school_admin' || r === 'principal' },
    { key: 'marks', label: t('nav.marks', 'Marks Entry'), icon: 'create-outline', route: '/(app)/marks', show: r === 'teacher' },
    { key: 'my-classes', label: t('nav.myClasses', 'My Classes'), icon: 'easel-outline', route: '/(app)/my-classes', show: r === 'teacher' },
    { key: 'exams', label: t('nav.exams', 'Exams'), icon: 'document-text-outline', route: '/(app)/exams', show: true },
    { key: 'fees', label: t('nav.fees', 'Fees'), icon: 'wallet-outline', route: '/(app)/fees', show: can('fees') },
    { key: 'timetable', label: t('nav.timetable', 'Timetable'), icon: 'calendar-outline', route: '/(app)/timetable', show: true },
    { key: 'payroll', label: t('nav.payroll', 'Payroll'), icon: 'cash-outline', route: '/(app)/payroll', show: can('payroll') },
    { key: 'polls', label: t('nav.polls', 'Polls'), icon: 'bar-chart-outline', route: '/(app)/polls', show: true },
    { key: 'users', label: t('nav.users', 'Users'), icon: 'person-circle-outline', route: '/(app)/users', show: can('users') },
    { key: 'audit', label: t('nav.audit', 'Audit Log'), icon: 'time-outline', route: '/(app)/audit', show: can('users') },
  ].filter(a => a.show);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl, paddingHorizontal: spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.muted} />}
        showsVerticalScrollIndicator={false}
      >
        <Container>
        {/* Top bar */}
        <View style={styles.topbar}>
          <View style={styles.roleRow}>
            <View style={[styles.roleDot, { backgroundColor: accent }]} />
            <Text style={styles.roleText}>{roleLabel(user?.role)}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <TouchableOpacity onPress={() => router.push('/(app)/settings')} style={styles.iconBtn} hitSlop={6}>
              <Ionicons name="settings-outline" size={19} color={colors.slate} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/(app)/settings')} style={styles.avatar} hitSlop={6}>
              <Text style={styles.avatarText}>{initials}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Greeting */}
        <Text style={styles.greeting}>Good day,{'\n'}{(user?.name ?? 'there').split(' ')[0]}</Text>
        <Text style={styles.school}>{school?.name ?? 'Your school'}</Text>

        {/* Stats — quiet cards, with colour carrying meaning (dues turn amber) */}
        <View style={styles.statRow}>
          <TouchableOpacity style={styles.statCard} activeOpacity={0.7} onPress={() => router.push('/(app)/students' as any)}>
            <View style={styles.statHead}>
              <View style={[styles.statIcon, { backgroundColor: moduleColor('students') + '14' }]}>
                <Ionicons name="people" size={14} color={moduleColor('students')} />
              </View>
              <Text style={styles.statLabel}>Students</Text>
            </View>
            <Text style={styles.statValue}>{stats.students ?? '—'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} activeOpacity={0.7} onPress={() => router.push('/(app)/fees' as any)}>
            <View style={styles.statHead}>
              <View style={[styles.statIcon, { backgroundColor: (stats.feesOutstanding ? colors.warning : moduleColor('fees')) + '14' }]}>
                <Ionicons name="wallet" size={14} color={stats.feesOutstanding ? colors.warning : moduleColor('fees')} />
              </View>
              <Text style={styles.statLabel}>Fees outstanding</Text>
            </View>
            <Text style={[styles.statValue, !!stats.feesOutstanding && { color: colors.warning }]}>
              {stats.feesOutstanding != null ? `₹${Number(stats.feesOutstanding).toLocaleString('en-IN')}` : '—'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Actions — a clean grid, hairline tiles */}
        <Text style={styles.sectionLabel}>{t('dashboard.quickActions', 'Quick actions')}</Text>
        <View style={styles.grid}>
          {actions.map(a => (
            <TouchableOpacity key={a.key} style={[styles.tile, { width: tileW }]} activeOpacity={0.7} onPress={() => router.push(a.route as any)}>
              <View style={[styles.tileIcon, { backgroundColor: moduleColor(a.key) + '14' }]}>
                <Ionicons name={a.icon} size={20} color={moduleColor(a.key)} />
              </View>
              <Text style={styles.tileLabel} numberOfLines={1}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        </Container>
      </ScrollView>
    </View>
  );
}


const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xxl },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  roleDot: { width: 7, height: 7, borderRadius: 4 },
  roleText: { ...font.caption, color: colors.slate, textTransform: 'uppercase' },
  iconBtn: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  avatar: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  avatarText: { color: colors.white, fontSize: 13, fontWeight: '600' },

  greeting: { ...font.display, color: colors.ink, lineHeight: 34 },
  school: { ...font.body, color: colors.slate, marginTop: spacing.xs },

  statRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statIcon: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  statLabel: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0 },
  statValue: { ...font.h1, color: colors.ink, marginTop: spacing.xs },

  sectionLabel: { ...font.caption, color: colors.muted, textTransform: 'uppercase', marginTop: spacing.xxl, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' },
  tile: { aspectRatio: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, justifyContent: 'space-between' },
  tileIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { ...font.label, color: colors.ink, fontWeight: '600' },
});
