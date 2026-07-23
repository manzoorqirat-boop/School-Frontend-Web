import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, ChipPicker, EmptyState, Loading } from '@/components/screen';
import { toast } from '@/components/toast';

const PAGE = 50;

export default function Audit() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);

  const [logs, setLogs] = useState<any[]>([]);
  const logsRef = useRef<any[]>([]);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const [fAction, setFAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);

  const inFlight = useRef(false);

  const load = useCallback(async (reset: boolean, action: string) => {
    if (inFlight.current) return;              // guard: onEndReached double-fires
    inFlight.current = true;
    reset ? setLoading(true) : setMore(true);
    try {
      const skip = reset ? 0 : logsRef.current.length;
      let url = `/api/audit-logs?limit=${PAGE}&skip=${skip}`;
      if (action) url += `&action=${encodeURIComponent(action)}`;
      const data = await API.get(url);
      setTotal(data.total ?? 0);
      setLogs(prev => {
        const next = reset ? (data.logs ?? []) : [...prev, ...(data.logs ?? [])];
        logsRef.current = next;
        return next;
      });
    } catch (e: any) { toast.error('Error', e.message); }
    finally { setLoading(false); setMore(false); inFlight.current = false; }
  }, []);

  useEffect(() => {
    load(true, '');
    API.get<string[]>('/api/audit-logs/actions').then(a => setActions(Array.isArray(a) ? a : [])).catch(() => {});
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  function changeFilter(a: string) { setFAction(a); load(true, a); }

  if (loading) return <Screen title={t('nav.audit', 'Audit Log')} colors={rt.gradient} onBack={() => router.back()}><Loading /></Screen>;

  return (
    <Screen title={t('nav.audit', 'Audit Log')} subtitle={`${total.toLocaleString('en-IN')} events`}
      colors={rt.gradient} onBack={() => router.back()} scroll={false}>
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <ChipPicker label="Action" options={['', ...actions]} value={fAction} onChange={changeFilter} />
      </View>
      <FlatList
        data={logs}
        keyExtractor={(l, i) => l._id ?? String(i)}
        contentContainerStyle={{ padding: spacing.lg }}
        ListEmptyComponent={<EmptyState tint={moduleColor('audit')} icon="time" text="No audit events match." />}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (!more && logs.length < total) load(false, fAction); }}
        ListFooterComponent={more ? <Text style={styles.more}>Loading more…</Text>
          : logs.length < total ? (
            <TouchableOpacity onPress={() => load(false, fAction)}>
              <Text style={styles.loadMore}>Load more ({logs.length} of {total})</Text>
            </TouchableOpacity>
          ) : null}
        renderItem={({ item: l }) => (
          <View style={styles.row}>
            <View style={styles.dot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.action}>{l.action}</Text>
              <Text style={styles.meta}>
                {l.actorName ?? l.userName ?? 'System'}{l.entity ? ` · ${l.entity}` : ''}
              </Text>
            </View>
            <Text style={styles.when}>
              {l.createdAt ? new Date(l.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
            </Text>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  action: { ...font.title, color: colors.ink },
  meta: { ...font.label, color: colors.muted, marginTop: 1 },
  when: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0 },
  more: { ...font.label, color: colors.muted, textAlign: 'center', paddingVertical: spacing.md },
  loadMore: { ...font.label, color: colors.primary, fontWeight: '600', textAlign: 'center', paddingVertical: spacing.md },
});