import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSchoolConfig, localDate } from '@/lib/schoolConfig';
import { can } from '@/lib/privileges';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, ChipPicker, EmptyState, Loading, DateField } from '@/components/screen';
import { Card, GradientButton } from '@/components/ui';
import { exportCSV, exportHTML, htmlTable } from '@/lib/export';
import { toast } from '@/components/toast';

// ─────────────────────────────────────────────────────────────────────────────
// Reports & Analytics
//
// The .NET API exposes eight report endpoints. Before this screen existed the
// app called exactly ONE of them (invoices/reports/summary, for the dashboard
// tile) — the other seven were unreachable from any UI, which is why "reports
// are not visible". This screen surfaces all of them behind the same privilege
// gates the backend enforces:
//
//   attendance:report          → attendance/reports/class
//                                attendance/reports/daily-summary
//                                attendance/reports/trends
//                                attendance/reports/period-breakdown
//   fee:report                 → invoices/reports/summary
//                                invoices/reports/collection
//                                invoices/reports/outstanding
//   teacher_attendance:report  → teacher-attendance/reports/monthly
//
// Every tab exports to CSV (and the tabular ones to printable HTML).
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'attendance' | 'fees' | 'staff';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const money = (n: any) => `\u20b9${Number(n ?? 0).toLocaleString('en-IN')}`;

// Wire values are snake_case ("half_day", "unpaid_leave"). Render them as
// human labels without hard-coding the full enum, so a new server-side status
// still displays sensibly instead of leaking a raw key.
function labelForStatus(k: string) {
  return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function pctTint(p: number) {
  if (p >= 85) return colors.emerald;
  if (p >= 70) return colors.amber;
  return colors.danger;
}

export default function Reports() {
  const router = useRouter();
  const { user } = useAuth();
  const { classes, sections } = useSchoolConfig();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);

  const canAtt = can(user, 'attendance:report');
  const canFee = can(user, 'fee:report');
  const canStaff = can(user, 'teacher_attendance:report');

  const tabs: { key: Tab; label: string; icon: any }[] = [
    ...(canAtt ? [{ key: 'attendance' as Tab, label: 'Attendance', icon: 'checkbox-outline' }] : []),
    ...(canFee ? [{ key: 'fees' as Tab, label: 'Fees', icon: 'wallet-outline' }] : []),
    ...(canStaff ? [{ key: 'staff' as Tab, label: 'Staff', icon: 'briefcase-outline' }] : []),
  ];
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'attendance');

  if (tabs.length === 0) {
    return (
      <Screen title="Reports" colors={rt.gradient} onBack={() => router.back()}>
        <EmptyState tint={moduleColor('reports')} icon="lock-closed" text="You don't have access to any reports." />
      </Screen>
    );
  }

  return (
    <Screen title={t('nav.reports', 'Reports & Analytics')} subtitle="Attendance · Fees · Staff"
      colors={rt.gradient} onBack={() => router.back()} scroll={false}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        {tabs.length > 1 && (
          <View style={styles.tabRow}>
            {tabs.map(tb => {
              const on = tb.key === tab;
              return (
                <TouchableOpacity key={tb.key} onPress={() => setTab(tb.key)}
                  style={[styles.tab, on && { backgroundColor: rt.accent, borderColor: rt.accent }]}>
                  <Ionicons name={tb.icon} size={15} color={on ? '#fff' : colors.slate} />
                  <Text style={[styles.tabText, on && { color: '#fff' }]}>{tb.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {tab === 'attendance' && <AttendanceReports classes={classes} sections={sections} accent={rt.accent} />}
        {tab === 'fees' && <FeeReports classes={classes} accent={rt.accent} />}
        {tab === 'staff' && <StaffReports accent={rt.accent} />}
      </ScrollView>
    </Screen>
  );
}

// ── Attendance ──────────────────────────────────────────────────────────────
function AttendanceReports({ classes, sections, accent }: { classes: string[]; sections: string[]; accent: string }) {
  const [cls, setCls] = useState(classes[0] ?? '1');
  const [sec, setSec] = useState(sections[0] ?? 'A');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(localDate());
  const [mode, setMode] = useState<'daily' | 'period'>('daily');

  const [loading, setLoading] = useState(false);
  const [today, setToday] = useState<any>(null);
  const [rows, setRows] = useState<any[] | null>(null);
  const [trends, setTrends] = useState<any[] | null>(null);
  const [periods, setPeriods] = useState<any[] | null>(null);

  // Daily summary is school-wide and needs no class/section, so load it once.
  useEffect(() => {
    API.get(`/api/attendance/reports/daily-summary?date=${localDate()}&mode=daily`)
      .then(setToday).catch(() => setToday(null));
  }, []);

  const run = useCallback(async () => {
    setLoading(true);
    setRows(null); setTrends(null); setPeriods(null);
    const qs = `class=${encodeURIComponent(cls)}&section=${encodeURIComponent(sec)}&from=${from}&to=${to}&mode=${mode}`;
    try {
      // Fire the three range reports together — one slow query shouldn't hold
      // up the others, and period-breakdown legitimately 400s in daily mode.
      const [cr, tr, pb] = await Promise.allSettled([
        API.get(`/api/attendance/reports/class?${qs}`),
        API.get(`/api/attendance/reports/trends?${qs}`),
        mode === 'period'
          ? API.get(`/api/attendance/reports/period-breakdown?class=${encodeURIComponent(cls)}&section=${encodeURIComponent(sec)}&from=${from}&to=${to}`)
          : Promise.resolve(null),
      ]);
      if (cr.status === 'fulfilled') setRows(cr.value?.rows ?? []);
      else toast.error('Class report failed', (cr.reason as any)?.message);
      if (tr.status === 'fulfilled') setTrends(tr.value?.rows ?? []);
      if (pb.status === 'fulfilled' && pb.value) setPeriods(pb.value?.rows ?? []);
    } finally { setLoading(false); }
  }, [cls, sec, from, to, mode]);

  useEffect(() => { run(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  async function doExport() {
    if (!rows?.length) { toast.error('Nothing to export', 'Run the report first.'); return; }
    try {
      await exportCSV(`attendance-${cls}-${sec}-${from}-to-${to}`,
        ['Roll', 'Admission', 'Name', 'Present', 'Absent', 'Late', 'Leave', 'Working Days', '%'],
        rows.map(r => [r.student?.rollNo, r.student?.admissionNo,
          `${r.student?.firstName ?? ''} ${r.student?.lastName ?? ''}`.trim(),
          r.present, r.absent, r.late, r.leave, r.workingDays, r.percentage]));
      toast.success('Exported', 'Attendance report downloaded.');
    } catch (e: any) { toast.error('Export failed', e.message); }
  }

  const avg = rows?.length
    ? Math.round((rows.reduce((s, r) => s + (r.percentage ?? 0), 0) / rows.length) * 10) / 10
    : null;
  const below75 = rows?.filter(r => (r.percentage ?? 0) < 75).length ?? 0;

  return (
    <>
      {/* Today, school-wide */}
      {today && (
        <Card>
          <Text style={styles.cardTitle}>Today · school-wide</Text>
          <View style={styles.kpiRow}>
            <Kpi label="Present" value={today.present} tint={colors.emerald} />
            <Kpi label="Absent" value={today.absent} tint={colors.danger} />
            <Kpi label="Late" value={today.late} tint={colors.amber} />
            <Kpi label="Leave" value={today.leave} tint={colors.sky} />
          </View>
          <View style={styles.pctBar}>
            <Text style={styles.pctLabel}>{today.marked} marked</Text>
            <Text style={[styles.pctBig, { color: pctTint(today.percentage ?? 0) }]}>{today.percentage ?? 0}%</Text>
          </View>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <Text style={styles.cardTitle}>Filters</Text>
        <ChipPicker label="Class" options={classes} value={cls} onChange={setCls} />
        <ChipPicker label="Section" options={sections} value={sec} onChange={setSec} />
        <ChipPicker label="Mode" options={['daily', 'period']} value={mode} onChange={(v) => setMode(v as any)} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><DateField label="From" value={from} onChange={setFrom} allowClear={false} /></View>
          <View style={{ flex: 1 }}><DateField label="To" value={to} onChange={setTo} allowClear={false} /></View>
        </View>
        <View style={{ height: spacing.sm }} />
        <GradientButton label="Run report" onPress={run} loading={loading} colors={[accent, accent]} />
      </Card>

      {loading && <Loading />}

      {/* Per-student */}
      {!loading && rows && (
        rows.length === 0
          ? <EmptyState tint={moduleColor('attendance')} icon="checkbox" text={`No attendance recorded for ${cls}-${sec} in this range.`} />
          : (
            <Card>
              <View style={styles.headRow}>
                <Text style={styles.cardTitle}>Per student ({rows.length})</Text>
                <TouchableOpacity onPress={doExport} hitSlop={8}>
                  <Ionicons name="download-outline" size={20} color={accent} />
                </TouchableOpacity>
              </View>
              <View style={styles.kpiRow}>
                <Kpi label="Class avg" value={`${avg ?? 0}%`} tint={pctTint(avg ?? 0)} />
                <Kpi label="Below 75%" value={below75} tint={below75 ? colors.danger : colors.emerald} />
              </View>
              <View style={{ height: spacing.sm }} />
              {rows.map((r, i) => (
                <View key={i} style={styles.studentRow}>
                  <Text style={styles.roll}>{r.student?.rollNo ?? '—'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sName}>{`${r.student?.firstName ?? ''} ${r.student?.lastName ?? ''}`.trim()}</Text>
                    <Text style={styles.sSub}>P {r.present} · A {r.absent} · L {r.late} · Lv {r.leave} / {r.workingDays}</Text>
                  </View>
                  <Text style={[styles.sPct, { color: pctTint(r.percentage ?? 0) }]}>{r.percentage ?? 0}%</Text>
                </View>
              ))}
            </Card>
          )
      )}

      {/* Trends */}
      {!loading && trends && trends.length > 0 && (
        <Card>
          <Text style={styles.cardTitle}>Daily trend</Text>
          {trends.map((d, i) => (
            <View key={i} style={styles.trendRow}>
              <Text style={styles.trendDate}>{String(d.date).slice(0, 10)}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.max(2, d.percentage ?? 0)}%`, backgroundColor: pctTint(d.percentage ?? 0) }]} />
              </View>
              <Text style={[styles.trendPct, { color: pctTint(d.percentage ?? 0) }]}>{d.percentage ?? 0}%</Text>
            </View>
          ))}
        </Card>
      )}

      {/* Period breakdown (period mode only) */}
      {!loading && periods && periods.length > 0 && (
        <Card>
          <Text style={styles.cardTitle}>Period breakdown</Text>
          {periods.map((p, i) => (
            <View key={i} style={styles.trendRow}>
              <Text style={styles.trendDate}>Period {p.period}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.max(2, p.percentage ?? 0)}%`, backgroundColor: pctTint(p.percentage ?? 0) }]} />
              </View>
              <Text style={[styles.trendPct, { color: pctTint(p.percentage ?? 0) }]}>{p.percentage ?? 0}%</Text>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

// ── Fees ────────────────────────────────────────────────────────────────────
function FeeReports({ classes, accent }: { classes: string[]; accent: string }) {
  const [summary, setSummary] = useState<any>(null);
  const [collection, setCollection] = useState<any>(null);
  const [outstanding, setOutstanding] = useState<any>(null);
  const [fCls, setFCls] = useState('');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(localDate());
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c, o] = await Promise.allSettled([
        API.get('/api/invoices/reports/summary'),
        API.get(`/api/invoices/reports/collection?from=${from}&to=${to}`),
        API.get(`/api/invoices/reports/outstanding${fCls ? `?class=${encodeURIComponent(fCls)}` : ''}`),
      ]);
      if (s.status === 'fulfilled') setSummary(s.value);
      if (c.status === 'fulfilled') setCollection(c.value);
      if (o.status === 'fulfilled') setOutstanding(o.value);
      if (s.status === 'rejected' && c.status === 'rejected' && o.status === 'rejected')
        toast.error('Reports failed', (s.reason as any)?.message);
    } finally { setLoading(false); }
  }, [from, to, fCls]);

  useEffect(() => { run(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  async function exportOutstanding() {
    const items = outstanding?.items ?? [];
    if (!items.length) { toast.error('Nothing to export', 'No outstanding invoices.'); return; }
    try {
      await exportCSV(`outstanding${fCls ? '-' + fCls : ''}`,
        ['Invoice', 'Student', 'Class', 'Total', 'Paid', 'Balance', 'Due date'],
        items.map((i: any) => [i.invoiceNo, i.studentName, i.studentClass, i.total, i.amountPaid, i.balance,
          i.dueDate ? String(i.dueDate).slice(0, 10) : '']));
      toast.success('Exported', 'Outstanding report downloaded.');
    } catch (e: any) { toast.error('Export failed', e.message); }
  }

  async function exportCollectionHtml() {
    const rows = collection?.byMethod ?? [];
    if (!rows.length) { toast.error('Nothing to export', 'No collections in this range.'); return; }
    try {
      const body = htmlTable(['Method', 'Payments', 'Total'],
        rows.map((r: any) => [labelForStatus(String(r.method ?? '')), r.count, money(r.total)]))
        + `<p><b>Total collected:</b> ${money(collection?.total)}</p>`;
      await exportHTML(`collection-${from}-to-${to}`, `Fee Collection · ${from} to ${to}`, body);
      toast.success('Exported', 'Collection report downloaded.');
    } catch (e: any) { toast.error('Export failed', e.message); }
  }

  const collected = Number(summary?.totalCollected ?? 0);
  const billed = Number(summary?.totalBilled ?? 0);
  const rate = billed > 0 ? Math.round((collected / billed) * 1000) / 10 : 0;

  return (
    <>
      {loading && <Loading />}

      {!loading && summary && (
        <Card>
          <Text style={styles.cardTitle}>Overall</Text>
          <View style={styles.kpiRow}>
            <Kpi label="Billed" value={money(summary.totalBilled)} tint={colors.sky} />
            <Kpi label="Collected" value={money(summary.totalCollected)} tint={colors.emerald} />
          </View>
          <View style={styles.kpiRow}>
            <Kpi label="Outstanding" value={money(summary.outstanding)} tint={Number(summary.outstanding) > 0 ? colors.danger : colors.emerald} />
            <Kpi label="Collection rate" value={`${rate}%`} tint={pctTint(rate)} />
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.max(2, rate)}%`, backgroundColor: pctTint(rate) }]} />
          </View>
        </Card>
      )}

      <Card>
        <Text style={styles.cardTitle}>Filters</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><DateField label="From" value={from} onChange={setFrom} allowClear={false} /></View>
          <View style={{ flex: 1 }}><DateField label="To" value={to} onChange={setTo} allowClear={false} /></View>
        </View>
        <ChipPicker label="Outstanding · class" options={['', ...classes]} value={fCls} onChange={setFCls} />
        <View style={{ height: spacing.sm }} />
        <GradientButton label="Run report" onPress={run} loading={loading} colors={[accent, accent]} />
      </Card>

      {!loading && collection && (
        <Card>
          <View style={styles.headRow}>
            <Text style={styles.cardTitle}>Collection by method</Text>
            <TouchableOpacity onPress={exportCollectionHtml} hitSlop={8}>
              <Ionicons name="download-outline" size={20} color={accent} />
            </TouchableOpacity>
          </View>
          {(collection.byMethod ?? []).length === 0
            ? <Text style={styles.muted}>No payments in this range.</Text>
            : (collection.byMethod ?? []).map((m: any, i: number) => (
              <View key={i} style={styles.methodRow}>
                <Text style={styles.methodName}>{labelForStatus(String(m.method ?? ''))}</Text>
                <Text style={styles.methodCount}>{m.count}</Text>
                <Text style={styles.methodTotal}>{money(m.total)}</Text>
              </View>
            ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{money(collection.total)}</Text>
          </View>
        </Card>
      )}

      {!loading && outstanding && (
        <Card>
          <View style={styles.headRow}>
            <Text style={styles.cardTitle}>Outstanding ({outstanding.count ?? 0})</Text>
            <TouchableOpacity onPress={exportOutstanding} hitSlop={8}>
              <Ionicons name="download-outline" size={20} color={accent} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.pctBig, { color: colors.danger, marginBottom: spacing.sm }]}>
            {money(outstanding.totalOutstanding)}
          </Text>
          {(outstanding.items ?? []).length === 0
            ? <Text style={styles.muted}>Nothing outstanding. </Text>
            : (outstanding.items ?? []).slice(0, 50).map((i: any, k: number) => (
              <View key={k} style={styles.studentRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sName}>{i.studentName}</Text>
                  <Text style={styles.sSub}>{i.invoiceNo} · Class {i.studentClass}{i.dueDate ? ` · due ${String(i.dueDate).slice(0, 10)}` : ''}</Text>
                </View>
                <Text style={[styles.sPct, { color: colors.danger }]}>{money(i.balance)}</Text>
              </View>
            ))}
          {(outstanding.items ?? []).length > 50 && (
            <Text style={styles.muted}>Showing first 50 — export for the full list.</Text>
          )}
        </Card>
      )}
    </>
  );
}

// ── Staff attendance ────────────────────────────────────────────────────────
function StaffReports({ accent }: { accent: string }) {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [data, setData] = useState<any>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const [r, u] = await Promise.allSettled([
        API.get(`/api/teacher-attendance/reports/monthly?year=${year}&month=${month}`),
        API.get('/api/users?role=teacher&limit=200'),
      ]);
      if (r.status === 'fulfilled') setData(r.value);
      else toast.error('Report failed', (r.reason as any)?.message);
      if (u.status === 'fulfilled') {
        const map: Record<string, string> = {};
        (u.value?.items ?? []).forEach((x: any) => { map[x._id] = x.name; });
        setNames(map);
      }
    } finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { run(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const teachers: any[] = data?.teachers ?? [];

  async function doExport() {
    if (!teachers.length) { toast.error('Nothing to export', 'No staff attendance for this month.'); return; }
    try {
      const statusKeys = Array.from(new Set(teachers.flatMap(t => Object.keys(t.statuses ?? {}))));
      await exportCSV(`staff-attendance-${year}-${String(month).padStart(2, '0')}`,
        ['Teacher', ...statusKeys.map(labelForStatus), 'Unpaid days'],
        teachers.map(t => [names[t.teacherId] ?? t.teacherId,
          ...statusKeys.map(k => t.statuses?.[k] ?? 0), t.unpaidDays]));
      toast.success('Exported', 'Staff attendance downloaded.');
    } catch (e: any) { toast.error('Export failed', e.message); }
  }

  return (
    <>
      <Card>
        <Text style={styles.cardTitle}>Month</Text>
        <ChipPicker label="Month" options={MONTHS} value={MONTHS[Number(month) - 1]}
          onChange={(v) => setMonth(String(MONTHS.indexOf(v) + 1))} />
        <ChipPicker label="Year"
          options={[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(String)}
          value={year} onChange={setYear} />
        <View style={{ height: spacing.sm }} />
        <GradientButton label="Run report" onPress={run} loading={loading} colors={[accent, accent]} />
      </Card>

      {loading && <Loading />}

      {!loading && (teachers.length === 0
        ? <EmptyState tint={moduleColor('staff-attendance')} icon="briefcase" text="No staff attendance recorded for this month." />
        : (
          <Card>
            <View style={styles.headRow}>
              <Text style={styles.cardTitle}>Staff ({teachers.length})</Text>
              <TouchableOpacity onPress={doExport} hitSlop={8}>
                <Ionicons name="download-outline" size={20} color={accent} />
              </TouchableOpacity>
            </View>
            {teachers.map((t, i) => (
              <View key={i} style={styles.studentRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sName}>{names[t.teacherId] ?? 'Teacher'}</Text>
                  <Text style={styles.sSub}>
                    {Object.entries(t.statuses ?? {}).map(([k, v]) => `${labelForStatus(k)} ${v}`).join(' · ') || '—'}
                  </Text>
                </View>
                <Text style={[styles.sPct, { color: t.unpaidDays > 0 ? colors.danger : colors.emerald }]}>
                  {t.unpaidDays ?? 0}d
                </Text>
              </View>
            ))}
            <Text style={styles.muted}>Unpaid days feed payroll deductions.</Text>
          </Card>
        ))}
    </>
  );
}

// ── Bits ────────────────────────────────────────────────────────────────────
function Kpi({ label, value, tint }: { label: string; value: any; tint: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={[styles.kpiValue, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabRow: { flexDirection: 'row', gap: spacing.sm },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line },
  tabText: { ...font.label, color: colors.slate, fontWeight: '600' },

  cardTitle: { ...font.title, color: colors.ink, marginBottom: spacing.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  muted: { ...font.label, color: colors.muted, marginTop: spacing.xs, textTransform: 'none', letterSpacing: 0 },

  kpiRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  kpi: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  kpiValue: { ...font.h3, fontWeight: '800' },
  kpiLabel: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0 },

  pctBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  pctLabel: { ...font.label, color: colors.muted },
  pctBig: { ...font.h2, fontWeight: '800' },

  studentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: colors.line },
  roll: { ...font.label, color: colors.muted, width: 30 },
  sName: { ...font.body, color: colors.ink, fontWeight: '600' },
  sSub: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0, marginTop: 1 },
  sPct: { ...font.title, fontWeight: '800' },

  trendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5 },
  trendDate: { ...font.caption, color: colors.slate, width: 78, textTransform: 'none', letterSpacing: 0 },
  trendPct: { ...font.label, fontWeight: '700', width: 46, textAlign: 'right' },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },

  methodRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: colors.line },
  methodName: { ...font.body, color: colors.ink, flex: 1 },
  methodCount: { ...font.label, color: colors.muted, width: 40, textAlign: 'right' },
  methodTotal: { ...font.body, color: colors.ink, fontWeight: '700', width: 110, textAlign: 'right' },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm },
  totalLabel: { ...font.title, color: colors.primary },
  totalValue: { ...font.title, color: colors.primary },
});
