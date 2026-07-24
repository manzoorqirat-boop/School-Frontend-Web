import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSchoolConfig } from '@/lib/schoolConfig';
import { can } from '@/lib/privileges';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, EmptyState, Loading, Field, FormModal, ChipPicker, DateField } from '@/components/screen';
import { Card, GradientButton } from '@/components/ui';
import { toast, confirm } from '@/components/toast';

// ─────────────────────────────────────────────────────────────────────────────
// Salary structures
//
// The payroll screen says "Requires an active salary structure for the teacher
// (set up in web admin)" — pointing at a screen that existed in neither app.
// The backend has had full CRUD all along:
//
//   GET  /api/payroll/structures[?teacherId=]
//   POST /api/payroll/structures
//   PUT  /api/payroll/structures/{id}
//   POST /api/payroll/structures/copy
//
// Frontend calls: zero. Which means payroll could not be generated AT ALL —
// neither per-teacher nor the bulk run — because every path first requires an
// active SalaryStructure row and nothing could create one.
//
// Unit conventions come straight from the entity and are easy to get wrong,
// so they are on-screen next to each input:
//   DA / HRA / PF / ESI  -> PERCENT of base salary
//   Income tax           -> PERCENT of GROSS (not base)
//   TA / Professional tax-> RUPEES, fixed
//   Leave deduction/day  -> RUPEES; 0 means base/30
// ─────────────────────────────────────────────────────────────────────────────

const money = (n: any) => `\u20b9${Number(n ?? 0).toLocaleString('en-IN')}`;
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Mirrors SalaryStructure.ComputeGrossBreakdown so the preview matches the server. */
function preview(f: any) {
  const base = num(f.baseSalary);
  const da = base * num(f.da) / 100;
  const hra = base * num(f.hra) / 100;
  const ta = num(f.ta);
  const gross = base + da + hra + ta;

  const pf = base * num(f.pf) / 100;
  const esi = base * num(f.esi) / 100;
  const pt = num(f.professionalTax);
  const it = gross * num(f.incomeTax) / 100;
  const deductions = pf + esi + pt + it;

  return { base, da, hra, ta, gross, pf, esi, pt, it, deductions, net: gross - deductions };
}

export default function SalaryStructures() {
  const router = useRouter();
  const { user } = useAuth();
  const { academicYear } = useSchoolConfig();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);

  const editable = can(user, 'payroll:manage');

  const [teachers, setTeachers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, us] = await Promise.allSettled([
        API.get('/api/payroll/structures'),
        API.get('/api/users?role=teacher&limit=200'),
      ]);
      // The endpoint returns a bare array, not { items }.
      if (list.status === 'fulfilled')
        setItems(Array.isArray(list.value) ? list.value : (list.value?.items ?? []));
      else toast.error('Could not load structures', (list.reason as any)?.message);
      if (us.status === 'fulfilled') setTeachers(us.value?.items ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const nameFor = (id: string) => teachers.find(x => x._id === id)?.name ?? 'Teacher';
  const withStructure = new Set(items.map(x => x.teacherId));
  const missing = teachers.filter(x => !withStructure.has(x._id));

  function openNew(teacherId?: string) {
    setEditing(null);
    setForm({
      teacherId: teacherId ?? teachers[0]?._id ?? '',
      academicYear: academicYear ?? '',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      baseSalary: '', da: '0', hra: '0', ta: '0',
      pf: '12', esi: '0', professionalTax: '0', incomeTax: '0',
      leaveDeductionPerDay: '0',
      bankAccountNumber: '', bankIfsc: '', bankAccountHolder: '',
    });
    setOpen(true);
  }

  function openEdit(s: any) {
    setEditing(s);
    setForm({
      teacherId: s.teacherId,
      academicYear: s.academicYear ?? '',
      effectiveFrom: String(s.effectiveFrom ?? '').slice(0, 10),
      baseSalary: String(s.baseSalary ?? ''),
      da: String(s.da ?? 0), hra: String(s.hra ?? 0), ta: String(s.ta ?? 0),
      pf: String(s.pf ?? 0), esi: String(s.esi ?? 0),
      professionalTax: String(s.professionalTax ?? 0),
      incomeTax: String(s.incomeTax ?? 0),
      leaveDeductionPerDay: String(s.leaveDeductionPerDay ?? 0),
      bankAccountNumber: s.bankAccountNumber ?? '',
      bankIfsc: s.bankIfsc ?? '',
      bankAccountHolder: s.bankAccountHolder ?? '',
    });
    setOpen(true);
  }

  async function save() {
    if (!form.teacherId) { toast.error('Missing', 'Pick a teacher.'); return; }
    if (num(form.baseSalary) <= 0) { toast.error('Invalid', 'Base salary must be greater than zero.'); return; }
    // The entity constrains these ranges; catching it here gives a useful
    // message instead of a 400 from model validation.
    for (const [k, label, max] of [['da', 'DA', 200], ['hra', 'HRA', 200],
      ['pf', 'PF', 100], ['esi', 'ESI', 100], ['incomeTax', 'Income tax', 100]] as const) {
      const v = num(form[k]);
      if (v < 0 || v > max) { toast.error('Invalid', `${label} must be between 0 and ${max}%.`); return; }
    }

    setSaving(true);
    try {
      const body: any = {
        teacherId: form.teacherId,
        academicYear: form.academicYear || academicYear || '',
        effectiveFrom: form.effectiveFrom,
        baseSalary: num(form.baseSalary),
        da: num(form.da), hra: num(form.hra), ta: num(form.ta),
        pf: num(form.pf), esi: num(form.esi),
        professionalTax: num(form.professionalTax),
        incomeTax: num(form.incomeTax),
        leaveDeductionPerDay: num(form.leaveDeductionPerDay),
        bankAccountNumber: form.bankAccountNumber?.trim() || null,
        bankIfsc: form.bankIfsc?.trim() || null,
        bankAccountHolder: form.bankAccountHolder?.trim() || null,
        isActive: true,
      };
      if (editing) {
        const updated = await API.put(`/api/payroll/structures/${editing._id}`, body);
        setItems(prev => prev.map(x => x._id === editing._id ? updated : x));
        toast.success('Structure updated', nameFor(form.teacherId));
      } else {
        const created = await API.post('/api/payroll/structures', body);
        setItems(prev => [...prev, created]);
        toast.success('Structure created', `${nameFor(form.teacherId)} \u00b7 ${money(body.baseSalary)} base`);
      }
      setOpen(false);
    } catch (e: any) { toast.error('Save failed', e.message); }
    finally { setSaving(false); }
  }

  async function deactivate(s: any) {
    const ok = await confirm({
      title: 'Deactivate structure',
      message: `Deactivate the salary structure for ${nameFor(s.teacherId)}? Payslips already generated keep their own copy of the figures.`,
      confirmLabel: 'Deactivate', destructive: true,
    });
    if (!ok) return;
    try {
      await API.put(`/api/payroll/structures/${s._id}`, { ...s, isActive: false });
      setItems(prev => prev.filter(x => x._id !== s._id));
      toast.success('Deactivated', nameFor(s.teacherId));
    } catch (e: any) { toast.error('Failed', e.message); }
  }

  const p = preview(form);

  return (
    <Screen title={t('nav.salaryStructures', 'Salary Structures')}
      subtitle={editable ? 'Required before payroll can run' : 'Read only'}
      colors={rt.gradient} onBack={() => router.back()} scroll={false}
      right={editable ? (
        <TouchableOpacity onPress={() => openNew()} style={styles.iconBtn}>
          <Ionicons name="add" size={22} color={colors.ink} />
        </TouchableOpacity>
      ) : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        {loading ? <Loading /> : (
          <>
            {missing.length > 0 && (
              <Card>
                <View style={styles.warnRow}>
                  <Ionicons name="alert-circle" size={16} color={colors.warning} />
                  <Text style={styles.warnText}>
                    {missing.length} teacher{missing.length === 1 ? '' : 's'} have no salary structure.
                    Payroll will skip them.
                  </Text>
                </View>
                {editable && missing.slice(0, 8).map(tch => (
                  <TouchableOpacity key={tch._id} style={styles.missRow} onPress={() => openNew(tch._id)}>
                    <Text style={styles.missName}>{tch.name}</Text>
                    <Text style={[styles.missAdd, { color: rt.accent }]}>Add</Text>
                  </TouchableOpacity>
                ))}
                {missing.length > 8 && (
                  <Text style={styles.hint}>and {missing.length - 8} more…</Text>
                )}
              </Card>
            )}

            {items.length === 0 ? (
              <EmptyState tint={moduleColor('payroll')} icon="card"
                text="No salary structures yet. Payroll cannot be generated until at least one exists." />
            ) : (
              <Card>
                <Text style={styles.cardTitle}>Active structures ({items.length})</Text>
                {items.map(s => (
                  <View key={s._id} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{nameFor(s.teacherId)}</Text>
                      <Text style={styles.sub}>
                        {`Base ${money(s.baseSalary)} \u00b7 DA ${s.da}% \u00b7 HRA ${s.hra}%`}
                        {s.academicYear ? ` \u00b7 ${s.academicYear}` : ''}
                      </Text>
                    </View>
                    {editable && (
                      <>
                        <TouchableOpacity onPress={() => openEdit(s)} style={styles.rowBtn} hitSlop={6}>
                          <Ionicons name="create-outline" size={19} color={colors.slate} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => deactivate(s)} style={styles.rowBtn} hitSlop={6}>
                          <Ionicons name="trash-outline" size={19} color={colors.danger} />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>

      <FormModal visible={open} title={editing ? 'Edit structure' : 'New salary structure'}
        onClose={() => setOpen(false)} onSubmit={save} submitting={saving}>
        {!editing && (
          <ChipPicker label="Teacher *" options={teachers.map(x => x.name)}
            value={nameFor(form.teacherId)}
            onChange={(nm) => setForm({ ...form, teacherId: teachers.find(x => x.name === nm)?._id ?? '' })} />
        )}
        <Field label="Base salary (\u20b9) *" value={form.baseSalary} keyboardType="numeric"
          onChangeText={(v: string) => setForm({ ...form, baseSalary: v })} placeholder="25000" />
        <DateField label="Effective from" value={form.effectiveFrom}
          onChange={(v) => setForm({ ...form, effectiveFrom: v })} allowClear={false} />

        <Text style={styles.section}>Allowances</Text>
        <View style={styles.pair}>
          <View style={{ flex: 1 }}>
            <Field label="DA (% of base)" value={form.da} keyboardType="numeric"
              onChangeText={(v: string) => setForm({ ...form, da: v })} placeholder="0" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="HRA (% of base)" value={form.hra} keyboardType="numeric"
              onChangeText={(v: string) => setForm({ ...form, hra: v })} placeholder="0" />
          </View>
        </View>
        <Field label="TA (\u20b9 fixed)" value={form.ta} keyboardType="numeric"
          onChangeText={(v: string) => setForm({ ...form, ta: v })} placeholder="0" />

        <Text style={styles.section}>Deductions</Text>
        <View style={styles.pair}>
          <View style={{ flex: 1 }}>
            <Field label="PF (% of base)" value={form.pf} keyboardType="numeric"
              onChangeText={(v: string) => setForm({ ...form, pf: v })} placeholder="12" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="ESI (% of base)" value={form.esi} keyboardType="numeric"
              onChangeText={(v: string) => setForm({ ...form, esi: v })} placeholder="0" />
          </View>
        </View>
        <View style={styles.pair}>
          <View style={{ flex: 1 }}>
            <Field label="Prof. tax (\u20b9)" value={form.professionalTax} keyboardType="numeric"
              onChangeText={(v: string) => setForm({ ...form, professionalTax: v })} placeholder="0" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Income tax (% of gross)" value={form.incomeTax} keyboardType="numeric"
              onChangeText={(v: string) => setForm({ ...form, incomeTax: v })} placeholder="0" />
          </View>
        </View>
        <Field label="Leave deduction / day (\u20b9, 0 = base/30)" value={form.leaveDeductionPerDay}
          keyboardType="numeric"
          onChangeText={(v: string) => setForm({ ...form, leaveDeductionPerDay: v })} placeholder="0" />

        {/* Live preview so the percent-vs-rupee conventions are obvious before
            saving, rather than discovered on the first payslip. */}
        {num(form.baseSalary) > 0 && (
          <View style={styles.previewBox}>
            <Text style={styles.previewTitle}>Monthly preview</Text>
            <PRow k="Base" v={money(p.base)} />
            <PRow k="DA" v={money(p.da)} />
            <PRow k="HRA" v={money(p.hra)} />
            <PRow k="TA" v={money(p.ta)} />
            <PRow k="Gross" v={money(p.gross)} bold />
            <PRow k="Deductions" v={`- ${money(p.deductions)}`} />
            <PRow k="Net pay" v={money(p.net)} bold tint={colors.emerald} />
          </View>
        )}

        <Text style={styles.section}>Bank (for transfers)</Text>
        <Field label="Account number" value={form.bankAccountNumber}
          onChangeText={(v: string) => setForm({ ...form, bankAccountNumber: v })} />
        <Field label="IFSC" value={form.bankIfsc} autoCapitalize="characters"
          onChangeText={(v: string) => setForm({ ...form, bankIfsc: v })} />
        <Field label="Account holder" value={form.bankAccountHolder}
          onChangeText={(v: string) => setForm({ ...form, bankAccountHolder: v })} />
        <Text style={styles.hint}>Bank details are encrypted at rest.</Text>
      </FormModal>
    </Screen>
  );
}

function PRow({ k, v, bold, tint }: { k: string; v: string; bold?: boolean; tint?: string }) {
  return (
    <View style={styles.pRow}>
      <Text style={[styles.pK, bold && { fontWeight: '700', color: colors.ink }]}>{k}</Text>
      <Text style={[styles.pV, bold && { fontWeight: '800' }, tint ? { color: tint } : null]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { ...font.title, color: colors.ink, marginBottom: spacing.sm },
  hint: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0, marginTop: 4 },

  warnRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: spacing.sm },
  warnText: { ...font.caption, color: colors.warning, flex: 1, textTransform: 'none', letterSpacing: 0, lineHeight: 17 },
  missRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 9, minHeight: 44, borderTopWidth: 1, borderTopColor: colors.line },
  missName: { ...font.body, color: colors.ink },
  missAdd: { ...font.label, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.line },
  rowBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  name: { ...font.body, color: colors.ink, fontWeight: '600' },
  sub: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0, marginTop: 1 },

  section: { ...font.label, color: colors.slate, fontWeight: '700', marginTop: spacing.md },
  pair: { flexDirection: 'row', gap: spacing.sm },

  previewBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  previewTitle: { ...font.label, color: colors.slate, fontWeight: '700', marginBottom: 4 },
  pRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  pK: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0 },
  pV: { ...font.caption, color: colors.ink, textTransform: 'none', letterSpacing: 0 },
});