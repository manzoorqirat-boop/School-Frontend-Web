import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSchoolConfig } from '@/lib/schoolConfig';
import { can } from '@/lib/privileges';
import { useI18n } from '@/i18n';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, ListItem, EmptyState, Loading, Field, ChipPicker, FormModal, DateField, AcademicYearPicker } from '@/components/screen';

const FREQ = ['annual', 'monthly', 'quarterly', 'one_time'];

type Head = { name: string; amount: string; frequency: string; isOptional: boolean };
type Inst = { name: string; dueDate: string; percentage: string };

export default function FeeStructures() {
  const router = useRouter();
  const { user, school } = useAuth();
  const { classes, sectionsWithBlank } = useSchoolConfig();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);
  const [structures, setStructures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>({ class: '1', section: '', academicYear: '' });
  const [heads, setHeads] = useState<Head[]>([]);
  const [insts, setInsts] = useState<Inst[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { const data = await API.get<any[]>('/api/fee-structures'); setStructures(Array.isArray(data) ? data : (data as any).items ?? []); }
    catch (e: any) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditId(null);
    setMeta({ name: '', class: '1', section: '', academicYear: '' });
    setHeads([{ name: '', amount: '', frequency: 'annual', isOptional: false }]);
    setInsts([]);
    setOpen(true);
  }
  function openEdit(fs: any) {
    setEditId(fs._id);
    setMeta({ name: fs.name, class: fs.class, section: fs.section ?? '', academicYear: fs.academicYear ?? '' });
    setHeads((fs.heads ?? []).map((h: any) => ({ name: h.name ?? '', amount: String(h.amount ?? ''), frequency: h.frequency ?? 'annual', isOptional: !!h.isOptional })));
    setInsts((fs.installments ?? []).map((i: any) => ({ name: i.name ?? '', dueDate: i.dueDate ? String(i.dueDate).slice(0, 10) : '', percentage: String(i.percentage ?? '') })));
    setOpen(true);
  }

  const totalAmount = heads.reduce((s, h) => s + (parseFloat(h.amount) || 0), 0);
  const instSum = insts.reduce((s, i) => s + (parseFloat(i.percentage) || 0), 0);

  async function save() {
    if (!meta.name?.trim()) { Alert.alert('Missing', 'Structure name is required.'); return; }
    const cleanHeads = heads.map(h => ({ name: h.name.trim(), amount: parseFloat(h.amount) || 0, frequency: h.frequency, isOptional: h.isOptional })).filter(h => h.name && h.amount > 0);
    if (!cleanHeads.length) { Alert.alert('Missing', 'Add at least one fee head with an amount.'); return; }
    const cleanInsts = insts.map(i => ({ name: i.name.trim(), dueDate: i.dueDate, percentage: parseFloat(i.percentage) || 0 })).filter(i => i.name && i.dueDate);
    if (cleanInsts.length) {
      const sum = cleanInsts.reduce((s, i) => s + i.percentage, 0);
      if (Math.abs(sum - 100) > 0.01) { Alert.alert('Invalid', `Installment percentages must sum to 100 (currently ${sum.toFixed(2)}).`); return; }
    }
    setSaving(true);
    try {
      const body: any = { name: meta.name.trim(), academicYear: meta.academicYear?.trim(), class: meta.class, section: meta.section || undefined, heads: cleanHeads, installments: cleanInsts };
      const saved = editId ? await API.put(`/api/fee-structures/${editId}`, body) : await API.post('/api/fee-structures', body);
      setStructures(prev => editId ? prev.map(x => x._id === editId ? saved : x) : [saved, ...prev]);
      setOpen(false);
    } catch (e: any) { Alert.alert('Save failed', e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <Screen title="Fee Structures" colors={rt.gradient} onBack={() => router.back()}><Loading /></Screen>;

  return (
    <Screen title="Fee Structures" subtitle={`${structures.length} defined`} colors={rt.gradient} onBack={() => router.back()} scroll={false}
      right={can(user, 'fee:manage') ? <TouchableOpacity onPress={openCreate} style={[styles.addBtn, { backgroundColor: moduleColor('fee-structures'), borderColor: moduleColor('fee-structures') }]}><Ionicons name="add" size={22} color="#fff" /></TouchableOpacity> : undefined}>
      <FlatList
        data={structures}
        keyExtractor={s => s._id}
        contentContainerStyle={{ padding: spacing.lg }}
        ListEmptyComponent={<EmptyState tint={moduleColor('fee-structures')} icon="pricetags" text="No fee structures yet." />}
        renderItem={({ item: s }) => {
          const total = (s.heads ?? []).reduce((a: number, h: any) => a + (h.amount ?? 0), 0);
          return (
            <ListItem
              title={s.name}
              subtitle={`Class ${s.class}${s.section ? '-' + s.section : ''} · ₹${total.toLocaleString('en-IN')} · ${(s.installments ?? []).length || 1} installment(s)`}
              onPress={can(user, 'fee:manage') ? () => openEdit(s) : undefined}
            />
          );
        }}
      />

      <FormModal visible={open} title={editId ? 'Edit structure' : 'New structure'} onClose={() => setOpen(false)}
        onSubmit={save} submitting={saving} submitLabel={editId ? 'Update' : 'Create'}>
        <Field label="Name *" value={meta.name} onChangeText={(v: string) => setMeta({ ...meta, name: v })} />
        <ChipPicker label="Class" options={classes} value={meta.class} onChange={(v) => setMeta({ ...meta, class: v })} />
        <ChipPicker label="Section (blank = all)" options={sectionsWithBlank} value={meta.section} onChange={(v) => setMeta({ ...meta, section: v })} />
        <AcademicYearPicker value={meta.academicYear} currentYear={school?.academicYear} onChange={(v) => setMeta({ ...meta, academicYear: v })} />

        {/* Heads */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Fee Heads · Total ₹{totalAmount.toLocaleString('en-IN')}</Text>
          <TouchableOpacity onPress={() => setHeads([...heads, { name: '', amount: '', frequency: 'annual', isOptional: false }])}>
            <Ionicons name="add-circle" size={26} color={rt.accent} />
          </TouchableOpacity>
        </View>
        {heads.map((h, i) => (
          <View key={i} style={styles.builderCard}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 2 }}><Field placeholder="Head name" value={h.name} onChangeText={(v: string) => setHeads(heads.map((x, j) => j === i ? { ...x, name: v } : x))} /></View>
              <View style={{ flex: 1 }}><Field placeholder="Amount" keyboardType="numeric" value={h.amount} onChangeText={(v: string) => setHeads(heads.map((x, j) => j === i ? { ...x, amount: v } : x))} /></View>
              <TouchableOpacity onPress={() => setHeads(heads.filter((_, j) => j !== i))} style={styles.delBtn}>
                <Ionicons name="trash" size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
            <ChipPicker options={FREQ} value={h.frequency} onChange={(v) => setHeads(heads.map((x, j) => j === i ? { ...x, frequency: v } : x))} />
            <TouchableOpacity onPress={() => setHeads(heads.map((x, j) => j === i ? { ...x, isOptional: !x.isOptional } : x))} style={styles.optRow}>
              <Ionicons name={h.isOptional ? 'checkbox' : 'square-outline'} size={20} color={rt.accent} />
              <Text style={styles.optText}>Optional head</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Installments */}
        <View style={styles.sectionRow}>
          <Text style={[styles.sectionTitle, Math.abs(instSum - 100) > 0.01 && insts.length > 0 && { color: colors.danger }]}>
            Installments · {instSum.toFixed(0)}%
          </Text>
          <TouchableOpacity onPress={() => setInsts([...insts, { name: '', dueDate: '', percentage: '' }])}>
            <Ionicons name="add-circle" size={26} color={rt.accent} />
          </TouchableOpacity>
        </View>
        {insts.map((inst, i) => (
          <View key={i} style={styles.builderCard}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 2 }}><Field placeholder="Name (e.g. Term 1)" value={inst.name} onChangeText={(v: string) => setInsts(insts.map((x, j) => j === i ? { ...x, name: v } : x))} /></View>
              <View style={{ flex: 1 }}><Field placeholder="%" keyboardType="numeric" value={inst.percentage} onChangeText={(v: string) => setInsts(insts.map((x, j) => j === i ? { ...x, percentage: v } : x))} /></View>
              <TouchableOpacity onPress={() => setInsts(insts.filter((_, j) => j !== i))} style={styles.delBtn}>
                <Ionicons name="trash" size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
            <DateField placeholder="Due date" value={inst.dueDate} onChange={(v) => setInsts(insts.map((x, j) => j === i ? { ...x, dueDate: v } : x))} />
          </View>
        ))}
        {insts.length === 0 && <Text style={styles.hint}>No installments = single annual payment.</Text>}
      </FormModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  sectionTitle: { ...font.title, color: colors.ink },
  builderCard: { backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.sm, gap: 8 },
  delBtn: { width: 44, alignItems: 'center', justifyContent: 'center' },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optText: { ...font.label, color: colors.slate },
  hint: { ...font.label, color: colors.muted, fontStyle: 'italic' },
});