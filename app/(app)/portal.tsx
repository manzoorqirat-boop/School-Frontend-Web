import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n';
import { API } from '@/lib/api';
import { themeForRole, colors, spacing, font, radius } from '@/theme';
import { GradientHeader, StatTile, ActionCard } from '@/components/ui';

// Parent + student portal.
export default function Portal() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const rt = themeForRole(user?.role);
  const [refreshing, setRefreshing] = useState(false);
  const [attendancePct, setAttendancePct] = useState<number | null>(null);
  const [feesDue, setFeesDue] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const sid = user?.studentId || (Array.isArray(user?.parentOf) ? user!.parentOf[0] : null);
      if (sid) {
        const att = await API.get(`/api/attendance/student/${sid}`).catch(() => null);
        if (att?.summary?.percentage != null) setAttendancePct(att.summary.percentage);
      }
      const inv = await API.get('/api/invoices?limit=50').catch(() => null);
      const items = inv?.items ?? [];
      const due = items.reduce((a: number, i: any) => a + Math.max(0, (i.total ?? 0) - (i.amountPaid ?? 0)), 0);
      setFeesDue(due);
    } catch {}
  }, [user]);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={rt.accent} />}>
      <GradientHeader colors={rt.gradient} subtitle={rt.label}
        title={`Hi, ${(user?.name ?? 'there').split(' ')[0]} 👋`}
        right={<View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => router.push('/(app)/settings')} style={styles.avatar}>
            <Ionicons name="settings-outline" size={20} color={colors.ink} />
          </TouchableOpacity>
          <TouchableOpacity onPress={signOut} style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name ?? 'U').split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()}</Text>
          </TouchableOpacity>
        </View>} />
      {pendingPolls.length > 0 && (
        <TouchableOpacity style={styles.pollBanner} onPress={() => router.push('/(app)/polls')}>
          <Ionicons name="bar-chart" size={20} color={colors.pink} />
          <View style={{ flex: 1 }}>
            <Text style={styles.pollTitle}>
              {pendingPolls.length === 1
                ? '1 poll needs your response'
                : `${pendingPolls.length} polls need your response`}
            </Text>
            <Text style={styles.pollSub} numberOfLines={1}>
              {pendingPolls.map((x: any) => x.title).join(' \u00b7 ')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.pink} />
        </TouchableOpacity>
      )}
      <View style={styles.statRow}>
        <StatTile label="Attendance" value={attendancePct != null ? `${attendancePct}%` : '—'} icon="checkbox" tint={colors.emerald} />
        <StatTile label="Fees Due" value={feesDue != null ? `₹${Number(feesDue).toLocaleString('en-IN')}` : '—'} icon="wallet" tint={colors.amber} />
      </View>
      <Text style={styles.section}>{t('portal.explore', 'Explore')}</Text>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
        <ActionCard title={t('nav.attendance', 'Attendance')} subtitle="Daily record & summary" icon="checkbox" tint={colors.emerald} onPress={() => router.push('/(app)/attendance-history')} />
        <ActionCard title={t('nav.reportCards', 'Report Cards')} subtitle="Exam results & grades" icon="ribbon" tint={colors.sky} onPress={() => router.push('/(app)/report-cards')} />
        <ActionCard title={t('nav.fees', 'Fees')} subtitle="Invoices & pay online" icon="wallet" tint={colors.amber} onPress={() => router.push('/(app)/fees')} />
        <ActionCard title={t('nav.timetable', 'Timetable')} subtitle="Class schedule" icon="calendar" tint={colors.indigo} onPress={() => router.push('/(app)/timetable')} />
        <ActionCard title={t('nav.polls', 'Polls')} subtitle="Vote & share feedback" icon="bar-chart" tint={colors.pink} onPress={() => router.push('/(app)/polls')} />
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  pollBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.md,
    minHeight: 56, marginHorizontal: spacing.lg, marginBottom: spacing.md,
    borderRadius: radius.lg, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.pink + '55' },
  pollTitle: { ...font.body, color: colors.ink, fontWeight: '700' },
  pollSub: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0, marginTop: 1 },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  statRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xl, marginTop: -spacing.lg },
  section: { ...font.h3, color: colors.ink, paddingHorizontal: spacing.xl, marginTop: spacing.xl, marginBottom: spacing.md },
});
