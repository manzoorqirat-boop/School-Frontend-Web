import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, spacing, font, radius, themeForRole } from '@/theme';
import { Screen, EmptyState, Loading } from '@/components/screen';
import { StatTile } from '@/components/ui';
import { toast } from '@/components/toast';

const STATUS_TINT: Record<string, string> = {
  present: colors.emerald, absent: colors.danger, late: colors.amber, leave: colors.sky, holiday: colors.muted,
};

export default function AttendanceHistory() {
  const router = useRouter();
  const { user } = useAuth();
  const rt = themeForRole(user?.role);

  const childIds: string[] = user?.role === 'student'
    ? (user?.studentId ? [user.studentId] : [])
    : (Array.isArray(user?.parentOf) ? user!.parentOf : []);
  const [child, setChild] = useState<string | undefined>(childIds[0]);
  // useState captures its initial value on the FIRST render only. AuthProvider
  // may still be resolving then, so childIds is [] and `child` stays undefined
  // forever — load() bails on `if (!sid)` and the endpoint is never called.
  // That is why the screen showed 0/0/0 no matter how much attendance was
  // marked. Adopt the first child as soon as the list actually arrives.
  useEffect(() => {
    if (!child && childIds.length > 0) setChild(childIds[0]);
  }, [child, childIds.join(',')]);  // eslint-disable-line react-hooks/exhaustive-deps
  const [childNames, setChildNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (childIds.length < 2) return;   // names only needed for the switcher
    API.get('/api/students?limit=20')
      .then((d: any) => {
        const map: Record<string, string> = {};
        (d.items ?? []).forEach((st: any) => { map[st._id] = `${st.firstName} ${st.lastName ?? ''}`.trim(); });
        setChildNames(map);
      })
      .catch(() => {});
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (sid?: string) => {
    if (!sid) { setLoading(false); return; }
    setLoading(true);
    try { setData(await API.get(`/api/attendance/student/${sid}`)); }
    catch (e: any) { toast.error('Error', e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(child); }, [child, load]);

  const s = data?.summary ?? {};

  return (
    <Screen title="Attendance" subtitle={s.percentage != null ? `${s.percentage}% present` : 'History'}
      colors={rt.gradient} onBack={() => router.back()} scroll={false}>
      {childIds.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, padding: spacing.lg, paddingBottom: 0 }}>
          {childIds.map((id, i) => {
            const on = id === child;
            return (
              <TouchableOpacity key={id} onPress={() => setChild(id)}
                style={[styles.childChip, on && { backgroundColor: rt.accent }]}>
                <Text style={[styles.childText, on && { color: '#fff' }]}>{childNames[id] ?? `Child ${i + 1}`}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loading ? <Loading /> : (
        <>
          <View style={styles.statRow}>
            <StatTile label="Present" value={s.present ?? 0} icon="checkmark-circle" tint={colors.emerald} />
            <StatTile label="Absent" value={s.absent ?? 0} icon="close-circle" tint={colors.danger} />
            <StatTile label="Late" value={s.late ?? 0} icon="time" tint={colors.amber} />
          </View>
          <FlatList
            data={data?.records ?? data?.items ?? []}
            keyExtractor={(r, i) => r._id ?? String(i)}
            contentContainerStyle={{ padding: spacing.lg }}
            ListEmptyComponent={<EmptyState icon="checkbox" text="No attendance records." />}
            renderItem={({ item: r }) => (
              <View style={styles.row}>
                <Text style={styles.date}>{r.date ? new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</Text>
                <View style={[styles.badge, { backgroundColor: (STATUS_TINT[r.status] ?? colors.muted) + '18' }]}>
                  <Text style={[styles.badgeText, { color: STATUS_TINT[r.status] ?? colors.muted }]}>{r.status}</Text>
                </View>
              </View>
            )}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  childChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.card },
  childText: { ...font.label, color: colors.slate },
  statRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  date: { ...font.body, color: colors.ink, fontWeight: '600' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { ...font.caption },
});
