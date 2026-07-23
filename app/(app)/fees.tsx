import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/privileges';
import { useI18n } from '@/i18n';
import { exportCSV } from '@/lib/export';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, SearchBar, ListItem, EmptyState, Loading, Field, ChipPicker, FormModal, DateField } from '@/components/screen';
import { toast } from '@/components/toast';

const STATUS_TINT: Record<string, string> = { pending: colors.warning, partial: colors.info, paid: colors.success, overdue: colors.danger, cancelled: colors.muted };
const newIdemKey = () => `mob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export default function Fees() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('');

  // detail / pay / discount / generate modal state
  const [detail, setDetail] = useState<any>(null);
  const [detailFull, setDetailFull] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [pay, setPay] = useState<any>(null);
  const [payForm, setPayForm] = useState<any>({ method: 'cash' });
  const [idemKey, setIdemKey] = useState('');
  const [disc, setDisc] = useState<any>(null);
  const [discForm, setDiscForm] = useState<any>({});
  const [genOpen, setGenOpen] = useState(false);
  const [structures, setStructures] = useState<any[]>([]);
  const [genForm, setGenForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { const data = await API.get('/api/invoices?limit=500'); setInvoices(data.items ?? []); }
    catch (e: any) { toast.error('Error', e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const filtered = useMemo(() => {
    let list = invoices;
    if (fStatus) list = list.filter(i => (i.status ?? 'pending') === fStatus);
    if (q.trim()) {
      const tt = q.toLowerCase();
      list = list.filter(i => [i.studentName, i.invoiceNo, i.studentAdmNo, i.studentClass]
        .filter(Boolean).some((v: string) => String(v).toLowerCase().includes(tt)));
    }
    return list;
  }, [invoices, q, fStatus]);

  // ── Detail ──────────────────────────────────────────────────────────────
  async function openDetail(inv: any) {
    setDetail(inv); setDetailFull(null); setPayments([]);
    try { setDetailFull(await API.get(`/api/invoices/${inv._id}`)); } catch { setDetailFull(inv); }
    loadPayments(inv._id);
  }
  async function loadPayments(invId: string) {
    try { const r = await API.get(`/api/invoices/${invId}/payments`); setPayments(r.items ?? []); } catch { setPayments([]); }
  }
  async function setChequeStatus(payment: any, status: 'success' | 'bounced') {
    const verb = status === 'success' ? 'clear' : 'bounce';
    const ok = await confirm({
      title: `Mark cheque ${verb}ed`,
      message: status === 'success'
        ? `Confirm cheque ${payment.chequeNo ?? ''} has cleared? The invoice will be credited ₹${(payment.amount ?? 0).toLocaleString('en-IN')}.`
        : `Mark cheque ${payment.chequeNo ?? ''} as bounced? The invoice will not be credited.`,
      confirmLabel: status === 'success' ? 'Clear' : 'Bounce',
      destructive: status !== 'success',
    });
    if (!ok) return;
    try {
      const res = await API.patch(`/api/invoices/${detail._id}/payments/${payment._id}/cheque-status`, { status });
      setPayments(prev => prev.map(p => p._id === payment._id ? (res.payment ?? { ...p, status }) : p));
      if (res.invoice) {
        setDetail((d: any) => ({ ...d, ...res.invoice }));
        setInvoices(prev => prev.map(x => x._id === detail._id ? { ...x, ...res.invoice } : x));
      }
      toast.success(
        status === 'success' ? 'Cheque cleared' : 'Cheque bounced',
        status === 'success' ? 'The invoice has been credited.' : 'The invoice was not credited.');
    } catch (e: any) { toast.error('Failed', e.message); }
  }
  // ── Pay (idempotent) ────────────────────────────────────────────────────
  function openPay(inv: any) {
    const balance = (inv.total ?? 0) - (inv.amountPaid ?? 0);
    setDetail(null);
    setPay(inv);
    setIdemKey(newIdemKey());               // one key per modal open = retry-safe
    setPayForm({ method: 'cash', amount: String(balance) });
  }

  async function collect() {
    const amt = parseFloat(payForm.amount);
    const bal = (pay.total ?? 0) - (pay.amountPaid ?? 0);
    if (!amt || amt <= 0) { toast.error('Invalid', 'Enter a valid amount.'); return; }
    if (payForm.method === 'cheque' && (!payForm.chequeNo?.trim() || !payForm.chequeBank?.trim())) {
      toast.error('Missing', 'Cheque number and bank are required for cheque payments.'); return;
    }
    if (payForm.method === 'cheque' && payForm.chequeDate && !/^\d{4}-\d{2}-\d{2}$/.test(payForm.chequeDate)) {
      toast.error('Invalid date', 'Cheque date must be YYYY-MM-DD.'); return;
    }
    if (['upi', 'card', 'bank_transfer'].includes(payForm.method) && !payForm.transactionRef?.trim()) {
      toast.error('Missing', 'Transaction reference is required for this method.'); return;
    }
    const proceed = async () => {
      setSaving(true);
      try {
        const res = await API.post(`/api/invoices/${pay._id}/pay-offline`, {
          amount: amt, method: payForm.method,
          chequeNo: payForm.chequeNo, chequeBank: payForm.chequeBank,
          chequeDate: payForm.method === 'cheque' ? (payForm.chequeDate || undefined) : undefined,
          transactionRef: payForm.transactionRef, notes: payForm.notes,
          idempotencyKey: idemKey,
        });
        setInvoices(prev => prev.map(x => x._id === pay._id ? (res.invoice ?? x) : x));
        setPay(null);
        toast.success('Payment recorded', payForm.method === 'cheque'
            ? `Cheque recorded as pending (Receipt ${res.payment?.receiptNo ?? ''}). The invoice will be credited once you mark the cheque cleared.`
            : `Receipt ${res.payment?.receiptNo ?? ''}`);
      } catch (e: any) { toast.error('Payment failed', e.message); }
      finally { setSaving(false); }
    };
    if (amt > bal) {
      const ok = await confirm({
        title: 'Overpayment',
        message: `Amount exceeds balance of ₹${bal.toLocaleString('en-IN')}. Record anyway?`,
        confirmLabel: 'Record',
      });
      if (ok) await proceed();
    } else await proceed();
  }

  // ── Discount ────────────────────────────────────────────────────────────
  function openDiscount(inv: any) { setDetail(null); setDisc(inv); setDiscForm({ discount: String(inv.discount ?? ''), reason: inv.discountReason ?? '' }); }
  async function applyDiscount() {
    const d = parseFloat(discForm.discount);
    if (isNaN(d) || d < 0) { toast.error('Invalid', 'Enter a valid discount amount (0 or more).'); return; }
    if (d > (disc.subtotal ?? 0)) { toast.error('Invalid', 'Discount cannot exceed the subtotal.'); return; }
    setSaving(true);
    try {
      const updated = await API.post(`/api/invoices/${disc._id}/discount`, { discount: d, reason: discForm.reason });
      setInvoices(prev => prev.map(x => x._id === disc._id ? updated : x));
      setDisc(null);
      toast.success('Discount applied', `New total \u20b9${(updated?.total ?? 0).toLocaleString('en-IN')}`);
    } catch (e: any) { toast.error('Failed', e.message); }
    finally { setSaving(false); }
  }

  // ── Generate invoices ───────────────────────────────────────────────────
  async function openGenerate() {
    setGenOpen(true); setGenForm({});
    try { const data = await API.get('/api/fee-structures'); setStructures(Array.isArray(data) ? data : data.items ?? []); }
    catch (e: any) { toast.error('Error', e.message); }
  }
  async function generate() {
    if (!genForm.structureId) { toast.error('Missing', 'Select a fee structure.'); return; }
    setSaving(true);
    try {
      const res = await API.post('/api/invoices/generate', {
        feeStructureId: genForm.structureId,
        installmentName: genForm.installment || undefined,
      });
      setGenOpen(false);
      toast.success('Invoices generated', `Created ${res.created ?? 0}, skipped ${res.skipped ?? 0} (already existed).`);
      load();
    } catch (e: any) { toast.error('Failed', e.message); }
    finally { setSaving(false); }
  }

  async function doExport() {
    try {
      await exportCSV('fees', ['Invoice', 'Student', 'Class', 'Total', 'Paid', 'Due', 'Status'],
        filtered.map(i => [i.invoiceNo, i.studentName, `${i.studentClass ?? ''}-${i.studentSection ?? ''}`, i.total ?? 0, i.amountPaid ?? 0, (i.total ?? 0) - (i.amountPaid ?? 0), i.status ?? 'pending']));
    } catch (e: any) { toast.error('Export failed', e.message); }
  }

  if (loading) return <Screen title={t('nav.fees', 'Fees')} colors={rt.gradient} onBack={() => router.back()}><Loading /></Screen>;

  const totalDue = filtered.reduce((a, i) => a + Math.max(0, (i.total ?? 0) - (i.amountPaid ?? 0)), 0);
  const selStructure = structures.find(s => s._id === genForm.structureId);

  return (
    <Screen title={t('nav.fees', 'Fees')} subtitle={`₹${totalDue.toLocaleString('en-IN')} outstanding`} colors={rt.gradient} onBack={() => router.back()} scroll={false}
      right={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={doExport} style={styles.hBtn}><Ionicons name="share-outline" size={20} color={colors.ink} /></TouchableOpacity>
          {can(user, 'fee:create') && (
            <TouchableOpacity onPress={openGenerate} style={[styles.hBtn, { backgroundColor: moduleColor('fees'), borderColor: moduleColor('fees') }]}><Ionicons name="add" size={22} color="#fff" /></TouchableOpacity>
          )}
        </View>
      }>
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <SearchBar value={q} onChangeText={setQ} placeholder="Student, invoice no, class…" />
        <ChipPicker label="Status" options={['', 'pending', 'partial', 'paid', 'overdue']} value={fStatus} onChange={setFStatus} />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={i => i._id}
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={rt.accent} />}
        ListEmptyComponent={<EmptyState tint={moduleColor('fees')} icon="wallet" text="No invoices. Use + to generate from a fee structure." />}
        renderItem={({ item: i }) => {
          const bal = (i.total ?? 0) - (i.amountPaid ?? 0);
          return (
            <ListItem
              title={i.studentName ?? i.invoiceNo}
              subtitle={`${i.invoiceNo} · ₹${(i.total ?? 0).toLocaleString('en-IN')}${bal > 0 ? ` · ₹${bal.toLocaleString('en-IN')} due` : ''}`}
              badge={i.status ?? 'pending'} badgeTint={STATUS_TINT[i.status ?? 'pending']}
              onPress={() => openDetail(i)}
            />
          );
        }}
      />

      {/* ── Invoice detail ── */}
      <FormModal visible={!!detail} title={detail?.invoiceNo ?? ''} onClose={() => setDetail(null)}
        onSubmit={() => setDetail(null)} submitLabel="Close">
        {detail && (
          <View style={{ gap: 6 }}>
            <Row k="Student" v={`${detail.studentName ?? ''} (${detail.studentClass ?? ''}-${detail.studentSection ?? ''})`} />
            <Row k="Academic year" v={detail.academicYear} />
            {(detailFull?.lines ?? []).map((l: any, idx: number) => (
              <Row key={idx} k={l.headName ?? l.name ?? `Line ${idx + 1}`} v={`₹${(l.amount ?? 0).toLocaleString('en-IN')}`} />
            ))}
            <Row k="Subtotal" v={`₹${(detail.subtotal ?? detail.total ?? 0).toLocaleString('en-IN')}`} />
            {(detail.discount ?? 0) > 0 && <Row k={`Discount${detail.discountReason ? ` (${detail.discountReason})` : ''}`} v={`−₹${detail.discount.toLocaleString('en-IN')}`} />}
            {(detail.lateFee ?? 0) > 0 && <Row k="Late fee" v={`₹${detail.lateFee.toLocaleString('en-IN')}`} />}
            <Row k="Total" v={`₹${(detail.total ?? 0).toLocaleString('en-IN')}`} strong />
            <Row k="Paid" v={`₹${(detail.amountPaid ?? 0).toLocaleString('en-IN')}`} />
            <Row k="Balance" v={`₹${Math.max(0, (detail.total ?? 0) - (detail.amountPaid ?? 0)).toLocaleString('en-IN')}`} strong />

            {/* Pending cheques — clear or bounce */}
            {payments.filter(p => p.method === 'cheque' && p.status === 'pending').length > 0 && (
              <View style={{ marginTop: spacing.md }}>
                <Text style={styles.sectHead}>Pending cheques</Text>
                {payments.filter(p => p.method === 'cheque' && p.status === 'pending').map(p => (
                  <View key={p._id} style={styles.chequeRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.chequeMain}>{p.chequeNo ?? '—'} · {p.chequeBank ?? ''}</Text>
                      <Text style={styles.chequeSub}>₹{(p.amount ?? 0).toLocaleString('en-IN')}{p.chequeDate ? ` · ${String(p.chequeDate).slice(0, 10)}` : ''}</Text>
                    </View>
                    {can(user, 'fee:collect') && (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity onPress={() => setChequeStatus(p, 'success')} style={[styles.chBtn, { backgroundColor: colors.success }]}>
                          <Text style={styles.chBtnText}>Clear</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setChequeStatus(p, 'bounced')} style={[styles.chBtn, { backgroundColor: colors.danger }]}>
                          <Text style={styles.chBtnText}>Bounce</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              {can(user, 'fee:collect') && ((detail.total ?? 0) - (detail.amountPaid ?? 0)) > 0 && (
                <TouchableOpacity style={[styles.actBtn, { backgroundColor: colors.primary }]} onPress={() => openPay(detail)}>
                  <Ionicons name="cash-outline" size={16} color="#fff" /><Text style={styles.actText}>Collect</Text>
                </TouchableOpacity>
              )}
              {can(user, 'fee:create') && (detail.status !== 'paid') && (
                <TouchableOpacity style={[styles.actBtn, { backgroundColor: colors.surfaceAlt }]} onPress={() => openDiscount(detail)}>
                  <Ionicons name="pricetag-outline" size={16} color={colors.ink} /><Text style={[styles.actText, { color: colors.ink }]}>Discount</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </FormModal>

      {/* ── Collect payment ── */}
      <FormModal visible={!!pay} title={`Collect · ${pay?.studentName ?? ''}`}
        onClose={() => setPay(null)} onSubmit={collect} submitting={saving} submitLabel="Record Payment">
        {pay && (
          <>
            <Text style={styles.bal}>Balance: ₹{((pay.total ?? 0) - (pay.amountPaid ?? 0)).toLocaleString('en-IN')}</Text>
            <Field label="Amount *" value={payForm.amount} keyboardType="numeric" onChangeText={(v: string) => setPayForm({ ...payForm, amount: v })} />
            <ChipPicker label="Method" options={['cash', 'cheque', 'upi', 'card', 'bank_transfer']} value={payForm.method} onChange={(v) => setPayForm({ ...payForm, method: v })} />
            {payForm.method === 'cheque' && (
              <>
                <Field label="Cheque No *" value={payForm.chequeNo} onChangeText={(v: string) => setPayForm({ ...payForm, chequeNo: v })} />
                <Field label="Bank *" value={payForm.chequeBank} onChangeText={(v: string) => setPayForm({ ...payForm, chequeBank: v })} />
                <DateField label="Cheque date" value={payForm.chequeDate} onChange={(v) => setPayForm({ ...payForm, chequeDate: v })} />
              </>
            )}
            {['upi', 'card', 'bank_transfer'].includes(payForm.method) && (
              <Field label="Transaction Ref *" value={payForm.transactionRef} onChangeText={(v: string) => setPayForm({ ...payForm, transactionRef: v })} />
            )}
            <Field label="Notes" value={payForm.notes} onChangeText={(v: string) => setPayForm({ ...payForm, notes: v })} />
          </>
        )}
      </FormModal>

      {/* ── Discount ── */}
      <FormModal visible={!!disc} title={`Discount · ${disc?.invoiceNo ?? ''}`}
        onClose={() => setDisc(null)} onSubmit={applyDiscount} submitting={saving} submitLabel="Apply">
        {disc && (
          <>
            <Text style={styles.balMuted}>Subtotal: ₹{(disc.subtotal ?? 0).toLocaleString('en-IN')}</Text>
            <Field label="Discount amount *" value={discForm.discount} keyboardType="numeric" onChangeText={(v: string) => setDiscForm({ ...discForm, discount: v })} />
            <Field label="Reason" value={discForm.reason} onChangeText={(v: string) => setDiscForm({ ...discForm, reason: v })} />
          </>
        )}
      </FormModal>

      {/* ── Generate invoices ── */}
      <FormModal visible={genOpen} title="Generate invoices" onClose={() => setGenOpen(false)}
        onSubmit={generate} submitting={saving} submitLabel="Generate">
        <Text style={styles.balMuted}>Creates one invoice per active student in the structure's class. Already-generated invoices are skipped.</Text>
        <ChipPicker label="Fee structure *" options={structures.map(s => s.name)} value={selStructure?.name ?? ''}
          onChange={(name) => { const s = structures.find(x => x.name === name); setGenForm({ structureId: s?._id, installment: '' }); }} />
        {selStructure && (selStructure.installments ?? []).length > 0 && (
          <ChipPicker label="Installment (blank = full year)" options={['', ...(selStructure.installments ?? []).map((i: any) => i.name)]}
            value={genForm.installment ?? ''} onChange={(v) => setGenForm({ ...genForm, installment: v })} />
        )}
      </FormModal>
    </Screen>
  );
}

function Row({ k, v, strong }: { k: string; v?: any; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowK}>{k}</Text>
      <Text style={[styles.rowV, strong && { fontWeight: '700' }]}>{v ?? '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  bal: { ...font.h3, color: colors.success },
  balMuted: { ...font.label, color: colors.slate },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 12 },
  rowK: { ...font.label, color: colors.muted, flexShrink: 1 },
  rowV: { ...font.body, color: colors.ink, fontWeight: '500' },
  actBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: radius.md },
  actText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sectHead: { ...font.caption, color: colors.muted, textTransform: 'uppercase', marginBottom: 6 },
  chequeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  chequeMain: { ...font.body, color: colors.ink, fontWeight: '500' },
  chequeSub: { ...font.label, color: colors.muted, marginTop: 1 },
  chBtn: { paddingHorizontal: 12, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  chBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});