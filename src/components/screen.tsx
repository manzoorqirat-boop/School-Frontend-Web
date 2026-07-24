import React from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, KeyboardAvoidingView, Platform, ViewStyle, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacing, font, shadow } from '@/theme';
import { GradientButton } from './ui';
import { Container, MAX_W, useBreakpoint } from './responsive';

// ── Screen scaffold: light refined top bar + back + scroll body ─────────────
// `colors` prop kept for back-compat (ignored now) so existing screens compile.
export function Screen({
  title, subtitle, onBack, right, children, scroll = true, maxWidth = MAX_W.wide,
}: {
  title: string; subtitle?: string; colors?: [string, string];
  onBack?: () => void; right?: React.ReactNode; children: React.ReactNode; scroll?: boolean;
  /** Content column cap. MAX_W.form for form-heavy screens. */
  maxWidth?: number;
}) {
  const insets = useSafeAreaInsets();
  // Content is capped and centred so percentage-based layouts inside resolve
  // against a phone-like column instead of a 1900px desktop viewport.
  const Body = scroll
    ? <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Container max={maxWidth}>{children}</Container>
      </ScrollView>
    : <View style={{ flex: 1 }}><Container max={maxWidth} style={{ flex: 1 }}>{children}</Container></View>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.bar, { paddingTop: insets.top + spacing.sm }]}>
        <Container max={maxWidth} style={styles.barRow}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={6}>
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            {subtitle ? <Text style={styles.barSub}>{subtitle}</Text> : null}
            <Text style={styles.barTitle}>{title}</Text>
          </View>
          {right}
        </Container>
      </View>
      {Body}
    </View>
  );
}

// ── Search bar ──────────────────────────────────────────────────────────────
export function SearchBar({ value, onChangeText, placeholder = 'Search…' }: {
  value: string; onChangeText: (t: string) => void; placeholder?: string;
}) {
  return (
    <View style={[styles.search, shadow.card]}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput style={styles.searchInput} value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor={colors.muted} autoCapitalize="none" />
      {value ? (
        <TouchableOpacity onPress={() => onChangeText('')}>
          <Ionicons name="close-circle" size={18} color={colors.muted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── List row ────────────────────────────────────────────────────────────────
export function ListItem({
  title, subtitle, badge, badgeTint, leading, onPress,
}: {
  title: string; subtitle?: string; badge?: string; badgeTint?: string;
  leading?: React.ReactNode; onPress?: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.row, shadow.card]}>
      {leading}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: (badgeTint ?? colors.primary) + '18' }]}>
          <Text style={[styles.badgeText, { color: badgeTint ?? colors.primary }]}>{badge}</Text>
        </View>
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
    </TouchableOpacity>
  );
}

// ── Circle avatar (initials) ────────────────────────────────────────────────
export function Avatar({ name, tint = colors.primary, size = 42 }: { name?: string; tint?: string; size?: number }) {
  const initials = (name ?? 'U').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint + '22',
      alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: tint, fontWeight: '800', fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

// ── Empty / loading / error states ──────────────────────────────────────────
export function EmptyState({ icon = 'file-tray', text, tint }: {
  icon?: keyof typeof Ionicons.glyphMap; text: string; tint?: string;
}) {
  // A softly tinted disc makes an empty screen read as "nothing here yet"
  // rather than "something failed" — grey-on-grey looks like an error.
  const c = tint ?? colors.primary;
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyDisc, { backgroundColor: c + '12' }]}>
        <Ionicons name={icon} size={30} color={c} />
      </View>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}
export function Loading() {
  return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;
}

// ── Form field ──────────────────────────────────────────────────────────────
export function Field({
  label, value, onChangeText, placeholder, keyboardType, secureTextEntry, autoCapitalize,
  disabled, hint, multiline, numberOfLines,
}: any) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      {/* `disabled` renders read-only rather than hiding the value — a field
          the server will not accept (admission number on edit, say) must still
          be visible, just clearly not editable. Typing into one and having the
          change silently dropped is the worse outcome. */}
      <TextInput
        style={[styles.fieldInput, shadow.card, disabled && styles.fieldDisabled,
          multiline && { minHeight: 90, textAlignVertical: 'top' }]}
        value={value?.toString() ?? ''}
        editable={!disabled}
        onChangeText={disabled ? undefined : onChangeText}
        placeholder={placeholder} placeholderTextColor={colors.muted}
        keyboardType={keyboardType} secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize} multiline={multiline} numberOfLines={numberOfLines} />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

// ── DateField: tappable field → wheel picker modal. Pure JS, no native dep.
//    Outputs YYYY-MM-DD. Optional min/max years relative to now.
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }  // m = 1..12

export function DateField({
  label, value, onChange, placeholder = 'Select date', minYear, maxYear, allowClear = true,
}: {
  label?: string; value?: string; onChange: (v: string) => void;
  placeholder?: string; minYear?: number; maxYear?: number; allowClear?: boolean;
}) {
  const now = new Date();
  const yEnd = maxYear ?? now.getFullYear() + 1;
  const yStart = minYear ?? now.getFullYear() - 70;
  const years: number[] = [];
  for (let y = yEnd; y >= yStart; y--) years.push(y);

  // Accept both "YYYY-MM-DD" and full ISO ("YYYY-MM-DDTHH:mm:ssZ") — the API
  // returns the latter, and an unparsed value would render as an empty field.
  const parsed = (() => {
    if (!value || typeof value !== 'string') return null;
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  })();

  const [open, setOpen] = React.useState(false);
  const [y, setY] = React.useState(parsed?.y ?? now.getFullYear());
  const [m, setM] = React.useState(parsed?.m ?? now.getMonth() + 1);
  const [d, setD] = React.useState(parsed?.d ?? now.getDate());

  React.useEffect(() => {
    if (!open) return;
    if (parsed) { setY(parsed.y); setM(parsed.m); setD(parsed.d); }
  }, [open]);  // eslint-disable-line react-hooks/exhaustive-deps

  const maxD = daysInMonth(y, m);
  const dd = Math.min(d, maxD);
  const days: number[] = [];
  for (let i = 1; i <= maxD; i++) days.push(i);

  function confirm() {
    const mm = String(m).padStart(2, '0');
    const day = String(dd).padStart(2, '0');
    onChange(`${y}-${mm}-${day}`);
    setOpen(false);
  }

  const display = parsed ? `${parsed.d} ${MONTHS_SHORT[parsed.m - 1]} ${parsed.y}` : '';

  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TouchableOpacity style={[styles.fieldInput, shadow.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
        onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={{ ...font.body, color: display ? colors.ink : colors.muted }}>{display || placeholder}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {display && allowClear ? (
            <TouchableOpacity onPress={() => onChange('')} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.muted} /></TouchableOpacity>
          ) : null}
          <Ionicons name="calendar-outline" size={18} color={colors.slate} />
        </View>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={pk.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity style={pk.sheet} activeOpacity={1}>
            <Text style={pk.title}>{label ?? 'Select date'}</Text>
            <View style={pk.wheelRow}>
              <Wheel data={days} value={dd} onPick={setD} width={64} render={(v) => String(v)} />
              <Wheel data={Array.from({ length: 12 }, (_, i) => i + 1)} value={m} onPick={setM} width={92} render={(v) => MONTHS_SHORT[v - 1]} />
              <Wheel data={years} value={y} onPick={setY} width={90} render={(v) => String(v)} />
            </View>
            <View style={pk.actions}>
              <TouchableOpacity onPress={() => setOpen(false)} style={[pk.btn, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[pk.btnText, { color: colors.ink }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirm} style={[pk.btn, { backgroundColor: colors.primary }]}>
                <Text style={[pk.btnText, { color: '#fff' }]}>Set date</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── TimeField: same pattern → HH:MM (24h). 5-minute step by default.
export function TimeField({
  label, value, onChange, placeholder = 'Select time', minuteStep = 5, allowClear = true,
}: {
  label?: string; value?: string; onChange: (v: string) => void;
  placeholder?: string; minuteStep?: number; allowClear?: boolean;
}) {
  const parsed = (() => {
    if (!value || typeof value !== 'string') return null;
    const m = value.match(/(?:^|T)(\d{1,2}):(\d{2})/);
    return m ? { h: +m[1], mi: +m[2] } : null;
  })();
  const [open, setOpen] = React.useState(false);
  const [h, setH] = React.useState(parsed?.h ?? 9);
  const [mi, setMi] = React.useState(parsed?.mi ?? 0);

  React.useEffect(() => { if (open && parsed) { setH(parsed.h); setMi(parsed.mi); } }, [open]);  // eslint-disable-line react-hooks/exhaustive-deps

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const mins: number[] = [];
  for (let i = 0; i < 60; i += minuteStep) mins.push(i);
  const miSnap = mins.includes(mi) ? mi : mins.reduce((a, b) => Math.abs(b - mi) < Math.abs(a - mi) ? b : a, mins[0]);

  function confirm() {
    onChange(`${String(h).padStart(2, '0')}:${String(miSnap).padStart(2, '0')}`);
    setOpen(false);
  }

  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TouchableOpacity style={[styles.fieldInput, shadow.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
        onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={{ ...font.body, color: value ? colors.ink : colors.muted }}>{value || placeholder}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {value && allowClear ? (
            <TouchableOpacity onPress={() => onChange('')} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.muted} /></TouchableOpacity>
          ) : null}
          <Ionicons name="time-outline" size={18} color={colors.slate} />
        </View>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={pk.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity style={pk.sheet} activeOpacity={1}>
            <Text style={pk.title}>{label ?? 'Select time'}</Text>
            <View style={pk.wheelRow}>
              <Wheel data={hours} value={h} onPick={setH} width={80} render={(v) => String(v).padStart(2, '0') + ' h'} />
              <Wheel data={mins} value={miSnap} onPick={setMi} width={80} render={(v) => String(v).padStart(2, '0') + ' m'} />
            </View>
            <View style={pk.actions}>
              <TouchableOpacity onPress={() => setOpen(false)} style={[pk.btn, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[pk.btnText, { color: colors.ink }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirm} style={[pk.btn, { backgroundColor: colors.primary }]}>
                <Text style={[pk.btnText, { color: '#fff' }]}>Set time</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── AcademicYearPicker: dropdown of YYYY-YYYY strings around the current/school year.
export function AcademicYearPicker({
  label = 'Academic Year', value, onChange, currentYear, span = 3,
}: {
  label?: string; value?: string; onChange: (v: string) => void; currentYear?: string; span?: number;
}) {
  // Anchor on the school's current AY if given, else this calendar year.
  const baseStart = (() => {
    if (currentYear && /^\d{4}-\d{4}$/.test(currentYear)) return +currentYear.slice(0, 4);
    const now = new Date();
    // Indian academic year usually starts April — before April, "current" is last year.
    return now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  })();
  const options: string[] = [];
  for (let s = baseStart - span; s <= baseStart + span; s++) options.push(`${s}-${s + 1}`);
  if (value && !options.includes(value)) options.unshift(value);

  return <ChipPicker label={label} options={options} value={value ?? ''} onChange={onChange} />;
}

// Shared scroll "wheel" column for the date/time pickers.
function Wheel({ data, value, onPick, width, render }: {
  data: number[]; value: number; onPick: (v: number) => void; width: number; render: (v: number) => string;
}) {
  return (
    <View style={[pk.wheel, { width }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
        {data.map(v => {
          const on = v === value;
          return (
            <TouchableOpacity key={v} onPress={() => onPick(v)} style={[pk.wheelItem, on && pk.wheelItemOn]}>
              <Text style={[pk.wheelText, on && pk.wheelTextOn]}>{render(v)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const pk = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  sheet: { width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { ...font.title, color: colors.ink, textAlign: 'center' },
  wheelRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, height: 200 },
  wheel: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, overflow: 'hidden' },
  wheelItem: { paddingVertical: 10, alignItems: 'center' },
  wheelItemOn: { backgroundColor: colors.primary + '18' },
  wheelText: { ...font.body, color: colors.slate },
  wheelTextOn: { color: colors.primary, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  btn: { flex: 1, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnText: { ...font.title },
});

// ── Picker (simple horizontal chips) ────────────────────────────────────────
export function ChipPicker({ label, options, value, onChange, blankLabel = 'All' }: {
  label?: string; options: string[]; value: string; onChange: (v: string) => void;
  /** Text shown for the '' option — the "no filter" choice. */
  blankLabel?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {options.map(o => {
          const on = o === value;
          // An empty-string option is the "no filter" choice. It used to render
          // as a blank chip — a coloured circle with no text, which reads as a
          // rendering bug rather than a control. Give it a visible label.
          return (
            <TouchableOpacity key={o || '__blank__'} onPress={() => onChange(o)}
              style={[styles.pick, on && { backgroundColor: colors.primary }]}>
              <Text style={[styles.pickText, on && { color: '#fff' }]}>{o === '' ? blankLabel : o}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Bottom-sheet style form modal ───────────────────────────────────────────
export function FormModal({
  visible, title, onClose, onSubmit, submitLabel = 'Save', submitting, children,
}: {
  visible: boolean; title: string; onClose: () => void; onSubmit: () => void;
  submitLabel?: string; submitting?: boolean; children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();

  // A bottom sheet is a phone idiom. On a wide screen it reads as broken —
  // a full-width strip pinned to the bottom of a 1900px window. Switch to a
  // centred dialog there; phone/tablet keep the sheet.
  return (
    <Modal visible={visible} animationType={isDesktop ? 'fade' : 'slide'} transparent onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ justifyContent: isDesktop ? 'center' : 'flex-end', alignItems: isDesktop ? 'center' : undefined, flex: 1 }}>
          <View style={[
            styles.sheet,
            { paddingBottom: insets.bottom + spacing.lg },
            isDesktop && {
              width: '100%', maxWidth: 640, borderRadius: radius.xl,
              marginHorizontal: spacing.lg, paddingBottom: spacing.lg,
            },
          ]}>
            {!isDesktop && <View style={styles.sheetHandle} />}
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{title}</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.slate} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.lg }}
              keyboardShouldPersistTaps="handled" style={{ maxHeight: Dimensions.get('window').height * 0.78 }}>
              {children}
            </ScrollView>
            <GradientButton label={submitLabel} onPress={onSubmit} loading={submitting} />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.bg,
    borderBottomWidth: 1, borderBottomColor: colors.line },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  barTitle: { ...font.h1, color: colors.ink },
  barSub: { ...font.caption, color: colors.muted, textTransform: 'uppercase' },

  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.card,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 48, marginBottom: spacing.md },
  searchInput: { flex: 1, ...font.body, color: colors.ink },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  rowTitle: { ...font.title, color: colors.ink },
  rowSub: { ...font.label, color: colors.muted, marginTop: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { ...font.caption },

  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyDisc: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyText: { ...font.body, color: colors.muted },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },

  fieldDisabled: { backgroundColor: colors.surfaceAlt, color: colors.muted },
  fieldHint: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0 },
  fieldLabel: { ...font.label, color: colors.slate },
  fieldInput: { backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: spacing.lg,
    height: 50, ...font.body, color: colors.ink },

  pick: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.card, ...shadow.card },
  pickText: { ...font.label, color: colors.slate },

  modalBg: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.lg, gap: spacing.md },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { ...font.h3, color: colors.ink },
});

// ── Collapsible section (for long forms like the student form) ──────────────
export function Collapsible({
  title, subtitle, defaultOpen, children,
}: {
  title: string; subtitle?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  return (
    <View style={collStyles.wrap}>
      <TouchableOpacity onPress={() => setOpen(o => !o)} style={collStyles.head} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          <Text style={collStyles.title}>{title}</Text>
          {subtitle ? <Text style={collStyles.sub}>{subtitle}</Text> : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.slate} />
      </TouchableOpacity>
      {open ? <View style={collStyles.body}>{children}</View> : null}
    </View>
  );
}

const collStyles = StyleSheet.create({
  wrap: { backgroundColor: colors.card, borderRadius: radius.md, marginBottom: spacing.sm, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  title: { ...font.title, color: colors.ink },
  sub: { ...font.label, color: colors.muted, marginTop: 1 },
  body: { padding: spacing.md, paddingTop: 0, gap: spacing.sm },
});
