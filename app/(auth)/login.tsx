import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { colors, radius, spacing, font } from '@/theme';

export default function Login() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [slug, setSlug] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focus, setFocus] = useState<string>('');

  async function submit() {
    if (!username || !password) { Alert.alert('Missing details', 'Enter your username and password.'); return; }
    setLoading(true);
    try { await signIn(slug || undefined, username, password); }
    catch (e: any) { Alert.alert('Login failed', e.message ?? 'Please try again.'); }
    finally { setLoading(false); }
  }

  const field = (
    key: string, icon: any, placeholder: string, value: string, set: (v: string) => void,
    opts: { secure?: boolean; right?: React.ReactNode; hint?: string } = {},
  ) => (
    <View>
      <View style={[styles.field, focus === key && styles.fieldFocus]}>
        <Ionicons name={icon} size={18} color={focus === key ? colors.primary : colors.muted} />
        <TextInput
          style={styles.input} value={value} onChangeText={set} placeholder={placeholder}
          placeholderTextColor={colors.muted} autoCapitalize="none" secureTextEntry={opts.secure}
          onFocus={() => setFocus(key)} onBlur={() => setFocus('')}
        />
        {opts.right}
      </View>
      {opts.hint ? <Text style={styles.hint}>{opts.hint}</Text> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl, paddingHorizontal: spacing.xl }} keyboardShouldPersistTaps="handled">
        {/* Brand mark — restrained, monochrome */}
        <View style={styles.mark}>
          <Ionicons name="school" size={24} color={colors.white} />
        </View>
        <Text style={styles.title}>QMSoft School</Text>
        <Text style={styles.subtitle}>Sign in to your workspace</Text>

        <View style={{ height: spacing.xxl }} />

        <View style={{ gap: spacing.md }}>
          {field('slug', 'business-outline', 'School code', slug, setSlug, { hint: 'Leave blank for platform admin' })}
          {field('user', 'person-outline', 'Username', username, setUsername)}
          {field('pass', 'lock-closed-outline', 'Password', password, setPassword, {
            secure: !show,
            right: (
              <TouchableOpacity onPress={() => setShow(s => !s)} hitSlop={8}>
                <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.muted} />
              </TouchableOpacity>
            ),
          })}
        </View>

        <TouchableOpacity onPress={submit} disabled={loading} activeOpacity={0.9}
          style={[styles.button, loading && { opacity: 0.7 }]}>
          {loading ? <ActivityIndicator color={colors.white} />
            : <><Text style={styles.buttonText}>Sign in</Text><Ionicons name="arrow-forward" size={18} color={colors.white} /></>}
        </TouchableOpacity>

        <View style={{ flex: 1 }} />
        <Text style={styles.foot}>Secured with end-to-end encryption</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  mark: { width: 52, height: 52, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  title: { ...font.display, color: colors.ink },
  subtitle: { ...font.body, color: colors.slate, marginTop: spacing.xs },
  field: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.md, height: 50 },
  fieldFocus: { borderColor: colors.primary, backgroundColor: colors.white },
  input: { flex: 1, ...font.body, color: colors.ink },
  hint: { ...font.caption, color: colors.muted, marginTop: 5, marginLeft: 2, textTransform: 'none', letterSpacing: 0 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.primary, height: 50, borderRadius: radius.md, marginTop: spacing.xl },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '600', letterSpacing: -0.1 },
  foot: { ...font.caption, color: colors.muted, textAlign: 'center', textTransform: 'none', letterSpacing: 0 },
});
