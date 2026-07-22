import React from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet,
  ViewStyle, TextStyle, Pressable, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, font, shadow } from '@/theme';

// ── Gradient header ─────────────────────────────────────────────────────────
export function GradientHeader({
  colors: g, title, subtitle, right, children, rounded = true,
}: {
  colors: [string, string]; title?: string; subtitle?: string;
  right?: React.ReactNode; children?: React.ReactNode; rounded?: boolean;
}) {
  return (
    <LinearGradient
      colors={g}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[styles.header, rounded && styles.headerRounded]}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
          {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </LinearGradient>
  );
}

// ── Stat tile (colorful, for dashboards) ────────────────────────────────────
export function StatTile({
  label, value, icon, tint, onPress,
}: {
  label: string; value: string | number; icon: keyof typeof Ionicons.glyphMap;
  tint: string; onPress?: () => void;
}) {
  const Body = (
    <View style={[styles.stat, shadow.card]}>
      <View style={[styles.statIcon, { backgroundColor: tint + '22' }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
  return onPress ? <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={{ flex: 1 }}>{Body}</TouchableOpacity>
                 : <View style={{ flex: 1 }}>{Body}</View>;
}

// ── Action card (big tappable row with icon) ────────────────────────────────
export function ActionCard({
  title, subtitle, icon, tint, onPress,
}: {
  title: string; subtitle?: string; icon: keyof typeof Ionicons.glyphMap;
  tint: string; onPress?: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.action, shadow.card]}>
      <View style={[styles.actionIcon, { backgroundColor: tint + '18' }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.actionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.actionSub}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </TouchableOpacity>
  );
}

// ── Buttons ─────────────────────────────────────────────────────────────────
export function GradientButton({
  label, onPress, loading, colors: g = [colors.primary, colors.primaryDark], disabled,
}: {
  label: string; onPress?: () => void; loading?: boolean;
  colors?: [string, string]; disabled?: boolean;
}) {
  // expo-linear-gradient does not render reliably under react-native-web —
  // the gradient layer comes out transparent, leaving a white box with white
  // text inside it (an invisible button). Every primary action in the app uses
  // this component, so on web we fall back to a solid fill using the first
  // gradient stop, which is the same brand colour.
  const isWeb = Platform.OS === 'web';

  return (
    <Pressable onPress={onPress} disabled={disabled || loading} style={{ opacity: disabled ? 0.6 : 1 }}>
      {isWeb ? (
        <View style={[styles.btn, shadow.float, { backgroundColor: g[0] }]}>
          {loading ? <ActivityIndicator color="#fff" />
                   : <Text style={styles.btnText}>{label}</Text>}
        </View>
      ) : (
        <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={[styles.btn, shadow.float]}>
          {loading ? <ActivityIndicator color="#fff" />
                   : <Text style={styles.btnText}>{label}</Text>}
        </LinearGradient>
      )}
    </Pressable>
  );
}

// ── Chip ────────────────────────────────────────────────────────────────────
export function Chip({ label, tint }: { label: string; tint: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: tint + '18' }]}>
      <Text style={[styles.chipText, { color: tint }]}>{label}</Text>
    </View>
  );
}

// ── Card wrapper ────────────────────────────────────────────────────────────
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, shadow.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl + 8, paddingBottom: spacing.xl },
  headerRounded: { borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { ...font.h1, color: colors.ink },
  headerSubtitle: { ...font.caption, color: colors.muted, textTransform: 'uppercase', marginBottom: 2 },

  stat: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: 6 },
  statIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  statValue: { ...font.h2, color: colors.ink },
  statLabel: { ...font.label, color: colors.slate },

  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card,
    borderRadius: radius.lg, padding: spacing.lg },
  actionIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { ...font.title, color: colors.ink },
  actionSub: { ...font.label, color: colors.muted, marginTop: 1 },

  btn: { height: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  chipText: { ...font.caption },

  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg },
});
