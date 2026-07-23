import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, TextInput, Linking, Share, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSchoolConfig, localDate } from '@/lib/schoolConfig';
import { can } from '@/lib/privileges';
import { useI18n } from '@/i18n';
import { exportCSV } from '@/lib/export';
import { translitEnToHi } from '@/lib/translit';
import { colors, spacing, font, radius, themeForRole, moduleColor } from '@/theme';
import { Screen, SearchBar, ListItem, Avatar, EmptyState, Loading, Field, ChipPicker, FormModal, Collapsible, DateField, AcademicYearPicker } from '@/components/screen';
import { toast, confirm } from '@/components/toast';


// Public student-profile links resolve on the web frontend, not the API host.
const WEB_BASE = 'https://schoolprd.qmsofts.com';
const STATUS_TINT: Record<string, string> = { active: colors.emerald, inactive: colors.muted, graduated: colors.sky, transferred: colors.amber };
const CATEGORIES = ['', 'GEN', 'OBC', 'SC', 'ST', 'EWS'];
const RELIGIONS = ['', 'Hindu', 'Muslim', 'Sikh', 'Christian', 'Buddhist', 'Jain', 'Other'];
const TRANSPORT = ['', 'self', 'school_bus', 'walk', 'other'];
const BLOOD = ['', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

// Paired English + auto-Hindi input.
function BilingualField({ label, en, hi, onEn, onHi }: {
  label: string; en: string; hi: string; onEn: (v: string) => void; onHi: (v: string) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} value={en} onChangeText={onEn} placeholder="Type in English" placeholderTextColor={colors.muted} />
      <TextInput style={[styles.input, styles.hiInput]} value={hi} onChangeText={onHi} placeholder="हिंदी (अपने आप)" placeholderTextColor={colors.muted} />
    </View>
  );
}

export default function Students() {
  const router = useRouter();
  const { user, school } = useAuth();
  const { classes, sections } = useSchoolConfig();
  const { t } = useI18n();
  const rt = themeForRole(user?.role);
  const [all, setAll] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [fClass, setFClass] = useState('');
  const [fStatus, setFStatus] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<any>(null);
  const [pinStatus, setPinStatus] = useState<'' | 'looking' | 'ok' | 'partial' | 'miss'>('');
  const [sharing, setSharing] = useState(false);
  const manualHi = useRef<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try { const data = await API.get('/api/students?limit=2000'); setAll(data.items ?? []); }
    catch (e: any) { toast.error('Error', e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const filtered = useMemo(() => {
    let list = all;
    if (fClass) list = list.filter(s => s.class === fClass);
    if (fStatus) list = list.filter(s => (s.status ?? 'active') === fStatus);
    if (q.trim()) {
      const tt = q.toLowerCase();
      list = list.filter(s => [s.firstName, s.lastName, s.admissionNo, s.rollNo, s.fatherName, s.phone, s.fatherPhone]
        .filter(Boolean).some((v: string) => String(v).toLowerCase().includes(tt)));
    }
    return list;
  }, [all, q, fClass, fStatus]);

  async function openCreate() {
    manualHi.current = {};
    const base: any = {
      class: '1', section: 'A', gender: '', status: 'active',
      academicYear: school?.academicYear ?? '', nationality: 'Indian',
      admissionDate: localDate(),
    };
    setEditingId(null);
    setForm(base);
    setFormOpen(true);
    // Auto admission number
    try { const r = await API.get('/api/students/next-admission-no'); if (r?.admissionNo) setForm((p: any) => ({ ...p, admissionNo: r.admissionNo })); } catch {}
    // Auto roll number for default class/section
    fetchRoll(base.class, base.section);
  }

  function openEdit(s: any) {
    manualHi.current = { firstNameHi: !!s.firstNameHi, lastNameHi: !!s.lastNameHi, fatherNameHi: !!s.fatherNameHi, motherNameHi: !!s.motherNameHi };
    const next = { ...s };
    ['dob', 'admissionDate', 'tcDate'].forEach(d => { if (next[d]) next[d] = String(next[d]).slice(0, 10); });
    setEditingId(s._id);
    setForm(next);
    setView(null);
    setFormOpen(true);
  }

  async function fetchRoll(cls: string, sec: string) {
    if (!cls || !sec) return;
    try { const r = await API.get(`/api/students/next-roll-no?class=${encodeURIComponent(cls)}&section=${encodeURIComponent(sec)}`); if (r?.rollNo) setForm((p: any) => ({ ...p, rollNo: r.rollNo })); } catch {}
  }

  // English change → auto-fill paired Hindi (unless user typed Hindi manually)
  function onEn(enKey: string, hiKey: string, v: string) {
    setForm((p: any) => {
      const next = { ...p, [enKey]: v };
      if (!manualHi.current[hiKey]) next[hiKey] = translitEnToHi(v.trim());
      return next;
    });
  }
  function onHi(hiKey: string, v: string) { manualHi.current[hiKey] = true; setForm((p: any) => ({ ...p, [hiKey]: v })); }

  function badDate(v?: string) { return v && !/^\d{4}-\d{2}-\d{2}$/.test(v); }

  async function save() {
    if (!form.firstName || !form.admissionNo || !form.class || !form.section) {
      toast.error('Missing', 'First name, admission number, class and section are required.');
      return;
    }
    for (const [k, label] of [['dob','Date of Birth'],['admissionDate','Admission Date'],['tcDate','TC Date']] as const) {
      if (badDate(form[k])) { toast.error('Invalid date', `${label} must be in YYYY-MM-DD format.`); return; }
    }
    if (form.pincode && !/^[1-9]\d{5}$/.test(form.pincode)) {
      toast.error('Invalid pincode', 'Indian pincode must be 6 digits starting 1-9.');
      return;
    }
    if (form.aadharNo && !/^\d{12}$/.test(String(form.aadharNo).replace(/\s/g,''))) {
      toast.error('Invalid Aadhar', 'Aadhar number must be 12 digits.');
      return;
    }
    setSaving(true);
    try {
      // Sanitize child collections: drop fully-empty rows, coerce NaN → null so
      // JSON.stringify never emits a value the network layer can choke on.
      const num = (v: any) => (v === '' || v == null || Number.isNaN(v)) ? null : Number(v);

      // Date columns bind to a nullable DateOnly server-side. A cleared input
      // leaves '' in state, which fails model binding with a 400 before the
      // action runs — send undefined (key omitted) instead.
      const d = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

      const payload = {
        ...form,
        dob: d(form.dob),
        admissionDate: d(form.admissionDate),
        tcDate: d(form.tcDate),
        siblings: (form.siblings ?? [])
          .filter((s: any) => (s.name ?? '').trim() || (s.class ?? '').trim())
          .map((s: any) => ({ name: s.name ?? '', class: s.class ?? '', relation: s.relation || null, sameSchool: s.sameSchool !== false })),
        passedExams: (form.passedExams ?? [])
          .filter((e: any) => (e.examName ?? '').trim() || (e.institution ?? '').trim())
          .map((e: any) => ({
            examName: e.examName ?? '', institution: e.institution ?? '', year: e.year ?? '',
            rollNo: e.rollNo ?? '', board: e.board ?? '',
            obtainedMarks: num(e.obtainedMarks), maxMarks: num(e.maxMarks),
          })),
      };
      const saved = editingId ? await API.put(`/api/students/${editingId}`, payload) : await API.post('/api/students', payload);
      setAll(prev => editingId ? prev.map(x => x._id === editingId ? { ...x, ...saved } : x) : [saved, ...prev]);
      setFormOpen(false);
      toast.success(editingId ? 'Student updated' : 'Student created',
        `${[saved.firstName, saved.lastName].filter(Boolean).join(' ')} \u00b7 Adm ${saved.admissionNo ?? ''}`);
      if (saved._parent?.created) toast.success('Parent account created', `Username: ${saved._parent.username}\nPassword: ${saved._parent.password}`);
    } catch (e: any) { toast.error('Save failed', e.message); }
    finally { setSaving(false); }
  }

  // ── Share ─────────────────────────────────────────────────────────────
  const publicLink = (s: any) => s?.shareEnabled && s?.shareToken ? `${WEB_BASE}/student-public?t=${s.shareToken}` : '';

  function buildShareText(s: any, withLink = true) {
    const schoolName = school?.name || 'QMSoft School';
    const name = [s.firstName, s.lastName].filter(Boolean).join(' ');
    const hi = s.firstNameHi ? ` (${s.firstNameHi}${s.lastNameHi ? ' ' + s.lastNameHi : ''})` : '';
    const lines = [
      schoolName, '', 'Student Profile',
      `${name}${hi}`,
      `Class ${s.class}-${s.section || ''} · Adm No #${s.admissionNo}`,
    ];
    if (s.fatherName) lines.push(`Father: ${s.fatherName}`);
    if (s.fatherPhone) lines.push(`Phone: ${s.fatherPhone}`);
    const link = publicLink(s);
    if (withLink && link) lines.push('', `View profile: ${link}`);
    return lines.join('\n');
  }

  // Enable sharing (idempotent-ish): returns the current or newly-minted token.
  async function ensureShare(s: any): Promise<any> {
    if (s.shareEnabled && s.shareToken) return s;
    setSharing(true);
    try {
      const resp = await API.post(`/api/students/${s._id}/share`);
      const updated = { ...s, shareToken: resp.token, shareEnabled: true };
      setAll((prev: any[]) => prev.map((x: any) => x._id === s._id ? updated : x));
      setView((v: any) => v && v._id === s._id ? updated : v);
      return updated;
    } finally { setSharing(false); }
  }

  async function disableShare(s: any) {
    try {
      await API.del(`/api/students/${s._id}/share`);
      const updated = { ...s, shareToken: undefined, shareEnabled: false };
      setAll((prev: any[]) => prev.map((x: any) => x._id === s._id ? updated : x));
      setView((v: any) => v && v._id === s._id ? updated : v);
    } catch (e: any) { toast.error('Failed', e.message); }
  }

  async function shareWhatsApp(s0: any) {
    try {
      const s = await ensureShare(s0);
      const phone = (s.fatherPhone || s.motherPhone || s.phone || '').replace(/\D/g, '');
      const text = encodeURIComponent(buildShareText(s));
      const url = phone ? `https://wa.me/91${phone}?text=${text}` : `https://wa.me/?text=${text}`;
      const ok = await Linking.canOpenURL(url);
      if (!ok) { toast.error('WhatsApp not available', 'Install WhatsApp or use another share option.'); return; }
      Linking.openURL(url);
    } catch (e: any) { toast.error('Failed', e.message); }
  }
  async function shareSMS(s0: any) {
    try {
      const s = await ensureShare(s0);
      const phone = (s.fatherPhone || s.motherPhone || s.phone || '').replace(/\D/g, '');
      const body = encodeURIComponent(buildShareText(s));
      const sep = Platform.OS === 'ios' ? '&' : '?';
      Linking.openURL(`sms:${phone ? '+91' + phone : ''}${sep}body=${body}`);
    } catch (e: any) { toast.error('Failed', e.message); }
  }
  async function shareEmail(s0: any) {
    try {
      const s = await ensureShare(s0);
      const subject = encodeURIComponent(`Student Profile — ${[s.firstName, s.lastName].filter(Boolean).join(' ')}`);
      const body = encodeURIComponent(buildShareText(s));
      Linking.openURL(`mailto:${s.email || ''}?subject=${subject}&body=${body}`);
    } catch (e: any) { toast.error('Failed', e.message); }
  }
  async function shareSheet(s0: any) {
    try {
      const s = await ensureShare(s0);
      await Share.share({ message: buildShareText(s), url: publicLink(s) || undefined });
    } catch { /* user dismissed */ }
  }
  async function copyLink(s0: any) {
    try {
      const s = await ensureShare(s0);
      const link = publicLink(s);
      if (!link) return;
      await Share.share({ message: link });   // no clipboard dep; share sheet lets them copy
    } catch { /* dismissed */ }
  }

  async function deactivate(s: any) {
    const ok = await confirm({
      title: 'Deactivate student',
      message: `Set ${s.firstName} inactive?`,
      confirmLabel: 'Deactivate', destructive: true,
    });
    if (!ok) return;
    try {
      await API.del(`/api/students/${s._id}`);
      setAll(prev => prev.map(x => x._id === s._id ? { ...x, status: 'inactive' } : x));
      setView(null);
      toast.success('Student deactivated', `${s.firstName} is now inactive.`);
    } catch (e: any) { toast.error('Error', e.message); }
  }

  async function doExport() {
    try {
      await exportCSV('students', ['Name', 'Admission No', 'Class', 'Section', 'Roll', 'Father', 'Phone', 'Status'],
        filtered.map(s => [`${s.firstName} ${s.lastName ?? ''}`.trim(), s.admissionNo, s.class, s.section, s.rollNo, s.fatherName, s.fatherPhone, s.status ?? 'active']));
    } catch (e: any) { toast.error('Export failed', e.message); }
  }

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  const setSibling = (i: number, k: string, v: any) =>
    setForm((p: any) => ({ ...p, siblings: (p.siblings ?? []).map((x: any, j: number) => j === i ? { ...x, [k]: v } : x) }));
  const setExam = (i: number, k: string, v: any) =>
    setForm((p: any) => ({ ...p, passedExams: (p.passedExams ?? []).map((x: any, j: number) => j === i ? { ...x, [k]: v } : x) }));

  // Pincode → city/state autofill via the backend lookup proxy. Debounced so a
  // 6-digit entry fires exactly one request. Never blocks manual entry: on
  // miss/offline the fields stay editable and we just show a hint.
  const pinTimer = useRef<any>(null);
  // Clear a pending lookup if the screen unmounts mid-debounce.
  useEffect(() => () => { if (pinTimer.current) clearTimeout(pinTimer.current); }, []);

  function onPincode(v: string) {
    const pin = v.replace(/\D/g, '').slice(0, 6);
    set('pincode', pin);
    setPinStatus('');
    if (pinTimer.current) clearTimeout(pinTimer.current);
    if (!/^[1-9]\d{5}$/.test(pin)) return;
    pinTimer.current = setTimeout(async () => {
      setPinStatus('looking');
      try {
        const r = await API.get(`/api/lookups/pincode/${pin}`);
        setForm((p: any) => ({
          ...p,
          // Don't clobber anything the user already typed.
          city: p.city?.trim() ? p.city : (r.city ?? p.city),
          state: p.state?.trim() ? p.state : (r.state ?? p.state),
        }));
        setPinStatus(r.cityNeedsManualEntry ? 'partial' : 'ok');
      } catch {
        setPinStatus('miss');   // 404/offline — leave fields for manual entry
      }
    }, 500);
  }

  if (loading) return <Screen title={t('nav.students', 'Students')} colors={rt.gradient} onBack={() => router.back()}><Loading /></Screen>;

  return (
    <Screen
      title={t('nav.students', 'Students')} subtitle={`${filtered.length} of ${all.length}`}
      colors={rt.gradient} onBack={() => router.back()} scroll={false}
      right={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={doExport} style={styles.addBtn}><Ionicons name="share-outline" size={22} color={colors.ink} /></TouchableOpacity>
          {can(user, 'student:create') && <TouchableOpacity onPress={openCreate} style={[styles.addBtn, { backgroundColor: moduleColor('students'), borderColor: moduleColor('students') }]}><Ionicons name="add" size={22} color="#fff" /></TouchableOpacity>}
        </View>
      }
    >
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <SearchBar value={q} onChangeText={setQ} placeholder="Name, admission no, phone…" />
        <ChipPicker label="Class" options={['', ...classes]} value={fClass} onChange={setFClass} />
        <View style={{ height: spacing.sm }} />
        <ChipPicker label="Status" options={['', 'active', 'inactive', 'graduated', 'transferred']} value={fStatus} onChange={setFStatus} />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={s => s._id}
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={rt.accent} />}
        ListEmptyComponent={<EmptyState tint={moduleColor('students')} icon="people" text="No students match." />}
        renderItem={({ item: s }) => (
          <ListItem
            leading={<Avatar name={`${s.firstName} ${s.lastName ?? ''}`} tint={rt.accent} />}
            title={`${s.firstName} ${s.lastName ?? ''}`.trim()}
            subtitle={`${s.class}-${s.section} · Adm ${s.admissionNo}${s.rollNo ? ' · Roll ' + s.rollNo : ''}`}
            badge={(s.status ?? 'active')} badgeTint={STATUS_TINT[s.status ?? 'active']}
            onPress={() => setView(s)}
          />
        )}
      />

      {/* Detail */}
      <FormModal visible={!!view} title={view ? `${view.firstName} ${view.lastName ?? ''}`.trim() : ''}
        onClose={() => setView(null)} onSubmit={() => view && openEdit(view)}
        submitLabel={can(user, 'student:update') ? 'Edit' : 'Close'}>
        {view && (
          <View style={{ gap: spacing.sm }}>
            <Detail k="Admission No" v={view.admissionNo} />
            <Detail k="Name (Hindi)" v={[view.firstNameHi, view.lastNameHi].filter(Boolean).join(' ')} />
            <Detail k="Class / Section" v={`${view.class} - ${view.section}`} />
            <Detail k="Roll No" v={view.rollNo} />
            <Detail k="DOB" v={view.dob ? String(view.dob).slice(0,10) : ''} />
            <Detail k="Gender" v={view.gender} />
            <Detail k="Blood Group" v={view.bloodGroup} />
            <Detail k="Father" v={view.fatherName} />
            <Detail k="Father Phone" v={view.fatherPhone} />
            <Detail k="Mother" v={view.motherName} />
            <Detail k="Category" v={view.category} />
            <Detail k="Religion" v={view.religion} />
            <Detail k="Address" v={[view.address, view.city, view.state, view.pincode].filter(Boolean).join(', ')} />
            <Detail k="Status" v={view.status} />

            {/* Share — public read-only profile link + composers */}
            {can(user, 'student:update') && (view.status ?? 'active') === 'active' && (
              <View style={styles.shareBox}>
                <View style={styles.shareHead}>
                  <Text style={styles.shareTitle}>Share profile</Text>
                  {view.shareEnabled && (
                    <TouchableOpacity onPress={() => disableShare(view)} hitSlop={6}>
                      <Text style={styles.shareOff}>Turn off link</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.shareHint}>
                  {view.shareEnabled
                    ? 'A read-only link is active. Anyone with it can view this profile.'
                    : 'Sharing creates a read-only public link for parents. It activates on first share.'}
                </Text>
                <View style={styles.shareRow}>
                  <ShareBtn icon="logo-whatsapp" label="WhatsApp" tint="#25D366" disabled={sharing} onPress={() => shareWhatsApp(view)} />
                  <ShareBtn icon="chatbubble-outline" label="SMS" tint={colors.info} disabled={sharing} onPress={() => shareSMS(view)} />
                  <ShareBtn icon="mail-outline" label="Email" tint={colors.primary} disabled={sharing} onPress={() => shareEmail(view)} />
                </View>
                <View style={styles.shareRow}>
                  <ShareBtn icon="link-outline" label="Copy link" tint={colors.slate} disabled={sharing} onPress={() => copyLink(view)} />
                  <ShareBtn icon="share-outline" label="More…" tint={colors.slate} disabled={sharing} onPress={() => shareSheet(view)} />
                  <View style={{ flex: 1 }} />
                </View>
              </View>
            )}

            {can(user, 'student:delete') && (view.status ?? 'active') === 'active' && (
              <TouchableOpacity onPress={() => deactivate(view)} style={styles.dangerBtn}>
                <Ionicons name="ban" size={18} color={colors.danger} />
                <Text style={styles.dangerText}>Deactivate student</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </FormModal>

      {/* Create / edit — full field set in collapsible sections */}
      <FormModal visible={formOpen} title={editingId ? 'Edit student' : 'New student'}
        onClose={() => setFormOpen(false)} onSubmit={save} submitting={saving}
        submitLabel={editingId ? 'Update' : 'Create'}>

        <Collapsible title="Identity" defaultOpen>
          <Field label="Admission No *" value={form.admissionNo} placeholder="Auto-generated…" onChangeText={(v: string) => set('admissionNo', v)} />
          <BilingualField label="First name *" en={form.firstName ?? ''} hi={form.firstNameHi ?? ''} onEn={(v) => onEn('firstName','firstNameHi',v)} onHi={(v) => onHi('firstNameHi',v)} />
          <BilingualField label="Last name" en={form.lastName ?? ''} hi={form.lastNameHi ?? ''} onEn={(v) => onEn('lastName','lastNameHi',v)} onHi={(v) => onHi('lastNameHi',v)} />
          <ChipPicker label="Class *" options={classes} value={form.class ?? '1'} onChange={(v) => { set('class', v); fetchRoll(v, form.section); }} />
          <ChipPicker label="Section *" options={sections} value={form.section ?? 'A'} onChange={(v) => { set('section', v); fetchRoll(form.class, v); }} />
          <Field label="Roll No" value={form.rollNo} onChangeText={(v: string) => set('rollNo', v)} />
          <AcademicYearPicker value={form.academicYear} currentYear={school?.academicYear} onChange={(v) => set('academicYear', v)} />
          <DateField label="Date of Birth" value={form.dob} onChange={(v) => set('dob', v)} />
          <DateField label="Admission Date" value={form.admissionDate} onChange={(v) => set('admissionDate', v)} />
          <ChipPicker label="Gender" options={['', 'male', 'female', 'other']} value={form.gender ?? ''} onChange={(v) => set('gender', v)} />
          <ChipPicker label="Blood Group" options={BLOOD} value={form.bloodGroup ?? ''} onChange={(v) => set('bloodGroup', v)} />
          <Field label="House" value={form.house} onChangeText={(v: string) => set('house', v)} />
        </Collapsible>

        <Collapsible title="Parents & Guardian">
          <BilingualField label="Father name" en={form.fatherName ?? ''} hi={form.fatherNameHi ?? ''} onEn={(v) => onEn('fatherName','fatherNameHi',v)} onHi={(v) => onHi('fatherNameHi',v)} />
          <Field label="Father phone" value={form.fatherPhone} keyboardType="phone-pad" onChangeText={(v: string) => set('fatherPhone', v)} />
          <Field label="Father occupation" value={form.fatherOccup} onChangeText={(v: string) => set('fatherOccup', v)} />
          <BilingualField label="Mother name" en={form.motherName ?? ''} hi={form.motherNameHi ?? ''} onEn={(v) => onEn('motherName','motherNameHi',v)} onHi={(v) => onHi('motherNameHi',v)} />
          <Field label="Mother phone" value={form.motherPhone} keyboardType="phone-pad" onChangeText={(v: string) => set('motherPhone', v)} />
          <Field label="Mother occupation" value={form.motherOccup} onChangeText={(v: string) => set('motherOccup', v)} />
          <Field label="Guardian name" value={form.guardianName} onChangeText={(v: string) => set('guardianName', v)} />
          <Field label="Guardian phone" value={form.guardianPhone} keyboardType="phone-pad" onChangeText={(v: string) => set('guardianPhone', v)} />
          <Field label="Guardian relation" value={form.guardianRel} onChangeText={(v: string) => set('guardianRel', v)} />
        </Collapsible>

        <Collapsible title="Contact & Address">
          <Field label="Phone" value={form.phone} keyboardType="phone-pad" onChangeText={(v: string) => set('phone', v)} />
          <Field label="Email" value={form.email} autoCapitalize="none" onChangeText={(v: string) => set('email', v)} />
          <Field label="Address" value={form.address} onChangeText={(v: string) => set('address', v)} />
          <Field label="City" value={form.city} onChangeText={(v: string) => set('city', v)} />
          <Field label="State" value={form.state} onChangeText={(v: string) => set('state', v)} />
          <Field label="Pincode" value={form.pincode} keyboardType="numeric" onChangeText={onPincode} />
          {pinStatus === 'looking' && <Text style={styles.pinHint}>Looking up city & state…</Text>}
          {pinStatus === 'ok' && <Text style={[styles.pinHint, { color: colors.success }]}>✓ City & state auto-filled</Text>}
          {pinStatus === 'partial' && <Text style={[styles.pinHint, { color: colors.warning }]}>State filled — enter city manually</Text>}
          {pinStatus === 'miss' && <Text style={[styles.pinHint, { color: colors.muted }]}>Couldn't auto-detect — enter city & state manually</Text>}
        </Collapsible>

        <Collapsible title="Category & Documents">
          <ChipPicker label="Category" options={CATEGORIES} value={form.category ?? ''} onChange={(v) => set('category', v)} />
          <Field label="Caste" value={form.caste} onChangeText={(v: string) => set('caste', v)} />
          <ChipPicker label="Religion" options={RELIGIONS} value={form.religion ?? ''} onChange={(v) => set('religion', v)} />
          <Field label="Mother tongue" value={form.motherTongue} onChangeText={(v: string) => set('motherTongue', v)} />
          <Field label="Nationality" value={form.nationality} onChangeText={(v: string) => set('nationality', v)} />
          <Field label="Aadhar No" value={form.aadharNo} keyboardType="numeric" onChangeText={(v: string) => set('aadharNo', v)} />
          <Field label="Birth Certificate No" value={form.birthCertNo} onChangeText={(v: string) => set('birthCertNo', v)} />
        </Collapsible>

        <Collapsible title="Transport">
          <ChipPicker label="Transport mode" options={TRANSPORT} value={form.transportMode ?? ''} onChange={(v) => set('transportMode', v)} />
          <Field label="Bus route" value={form.busRoute} onChangeText={(v: string) => set('busRoute', v)} />
          <Field label="Pickup point" value={form.pickupPoint} onChangeText={(v: string) => set('pickupPoint', v)} />
        </Collapsible>

        <Collapsible title="Previous School">
          <Field label="Previous school" value={form.prevSchool} onChangeText={(v: string) => set('prevSchool', v)} />
          <Field label="Previous class" value={form.prevClass} onChangeText={(v: string) => set('prevClass', v)} />
          <Field label="TC No" value={form.tcNo} onChangeText={(v: string) => set('tcNo', v)} />
          <DateField label="TC Date" value={form.tcDate} onChange={(v) => set('tcDate', v)} />
        </Collapsible>

        <Collapsible title={`Siblings${(form.siblings?.length ?? 0) > 0 ? ` (${form.siblings.length})` : ''}`}>
          {(form.siblings ?? []).map((sib: any, i: number) => (
            <View key={i} style={styles.childCard}>
              <View style={styles.childHead}>
                <Text style={styles.childIdx}>Sibling {i + 1}</Text>
                <TouchableOpacity onPress={() => set('siblings', (form.siblings ?? []).filter((_: any, j: number) => j !== i))}>
                  <Ionicons name="close-circle" size={20} color={colors.danger} />
                </TouchableOpacity>
              </View>
              <Field label="Name" value={sib.name} onChangeText={(v: string) => setSibling(i, 'name', v)} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Field label="Class" value={sib.class} onChangeText={(v: string) => setSibling(i, 'class', v)} /></View>
                <View style={{ flex: 1 }}>
                  <ChipPicker label="Relation" options={['brother', 'sister']} value={sib.relation ?? ''} onChange={(v) => setSibling(i, 'relation', v)} />
                </View>
              </View>
              <TouchableOpacity style={styles.checkRow} onPress={() => setSibling(i, 'sameSchool', !(sib.sameSchool !== false))}>
                <Ionicons name={sib.sameSchool !== false ? 'checkbox' : 'square-outline'} size={20} color={sib.sameSchool !== false ? colors.primary : colors.muted} />
                <Text style={styles.checkLabel}>Studies in this school</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addChild}
            onPress={() => set('siblings', [...(form.siblings ?? []), { name: '', class: '', relation: '', sameSchool: true }])}>
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.addChildText}>Add sibling</Text>
          </TouchableOpacity>
        </Collapsible>

        <Collapsible title={`Passed Exams${(form.passedExams?.length ?? 0) > 0 ? ` (${form.passedExams.length})` : ''}`}>
          {(form.passedExams ?? []).map((ex: any, i: number) => (
            <View key={i} style={styles.childCard}>
              <View style={styles.childHead}>
                <Text style={styles.childIdx}>Exam {i + 1}</Text>
                <TouchableOpacity onPress={() => set('passedExams', (form.passedExams ?? []).filter((_: any, j: number) => j !== i))}>
                  <Ionicons name="close-circle" size={20} color={colors.danger} />
                </TouchableOpacity>
              </View>
              <Field label="Exam name" value={ex.examName} placeholder="e.g. Class 10 Board" onChangeText={(v: string) => setExam(i, 'examName', v)} />
              <Field label="Institution / Board" value={ex.institution} onChangeText={(v: string) => setExam(i, 'institution', v)} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Field label="Year" value={ex.year} placeholder="2019-20" onChangeText={(v: string) => setExam(i, 'year', v)} /></View>
                <View style={{ flex: 1 }}><Field label="Board" value={ex.board} placeholder="CBSE" onChangeText={(v: string) => setExam(i, 'board', v)} /></View>
              </View>
              <Field label="Roll No" value={ex.rollNo} onChangeText={(v: string) => setExam(i, 'rollNo', v)} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Field label="Obtained" value={ex.obtainedMarks != null ? String(ex.obtainedMarks) : ''} keyboardType="numeric" onChangeText={(v: string) => setExam(i, 'obtainedMarks', v === '' ? null : parseFloat(v))} /></View>
                <View style={{ flex: 1 }}><Field label="Max marks" value={ex.maxMarks != null ? String(ex.maxMarks) : ''} keyboardType="numeric" onChangeText={(v: string) => setExam(i, 'maxMarks', v === '' ? null : parseFloat(v))} /></View>
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.addChild}
            onPress={() => set('passedExams', [...(form.passedExams ?? []), { examName: '', institution: '', year: '', board: '', rollNo: '', obtainedMarks: null, maxMarks: null }])}>
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.addChildText}>Add passed exam</Text>
          </TouchableOpacity>
        </Collapsible>

        <Collapsible title="Other">
          <ChipPicker label="Status" options={['active', 'inactive', 'graduated', 'transferred']} value={form.status ?? 'active'} onChange={(v) => set('status', v)} />
          <Field label="Notes" value={form.notes} onChangeText={(v: string) => set('notes', v)} />
        </Collapsible>
      </FormModal>
    </Screen>
  );
}

function ShareBtn({ icon, label, tint, onPress, disabled }: { icon: any; label: string; tint: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} style={[styles.shareBtn, disabled && { opacity: 0.5 }]}>
      <Ionicons name={icon} size={18} color={tint} />
      <Text style={styles.shareBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function Detail({ k, v }: { k: string; v?: any }) {
  return <View style={styles.detailRow}><Text style={styles.detailK}>{k}</Text><Text style={styles.detailV}>{v || '—'}</Text></View>;
}

const styles = StyleSheet.create({
  pinHint: { ...font.caption, color: colors.slate, marginTop: -spacing.xs, marginBottom: spacing.xs, textTransform: 'none', letterSpacing: 0 },
  shareBox: { marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, gap: spacing.sm },
  shareHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shareTitle: { ...font.title, color: colors.ink },
  shareOff: { ...font.label, color: colors.danger, fontWeight: '600' },
  shareHint: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0 },
  shareRow: { flexDirection: 'row', gap: spacing.sm },
  shareBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  shareBtnText: { ...font.label, color: colors.ink, fontWeight: '600' },
  childCard: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm, gap: 4 },
  childHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  childIdx: { ...font.label, color: colors.slate, fontWeight: '700' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  checkLabel: { ...font.body, color: colors.ink },
  addChild: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed' },
  addChildText: { ...font.label, color: colors.primary, fontWeight: '600' },
  addBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 12 },
  detailK: { ...font.label, color: colors.muted },
  detailV: { ...font.body, color: colors.ink, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 12, marginTop: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger + '40' },
  dangerText: { ...font.title, color: colors.danger },
  fieldLabel: { ...font.label, color: colors.slate },
  input: { backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 46, ...font.body, color: colors.ink },
  hiInput: { fontSize: 17 },
});
