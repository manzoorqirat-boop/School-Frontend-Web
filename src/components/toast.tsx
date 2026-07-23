import React, { createContext, useContext, useCallback, useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Platform, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, font, shadow } from '@/theme';

// ─────────────────────────────────────────────────────────────────────────────
// Why this exists
//
// The whole app used React Native's `Alert.alert` for every success / error
// message and every confirm dialog. On the native builds that's fine, but this
// project also ships a *web* build (expo export --platform web / react-native-
// web), and RN-web's `Alert` implementation is a no-op for the single-button
// form and only partially works for the multi-button form — in practice the
// `onPress` callbacks on confirm dialogs never fire in the browser.
//
// Net effect on web:
//   • "Saved", "Payment recorded", "Save failed" toasts → never shown. The user
//     taps Save, something happens (or doesn't), and there is zero feedback.
//   • "Deactivate student?", "Delete exam?", "Sign out?" confirms → the dialog
//     never appears AND the destructive callback never runs, so the action is
//     silently dead on web.
//
// This module provides two cross-platform primitives that DO work on web:
//   • toast.success / .error / .info / .warn — transient banner, top of screen
//   • confirm(...)   — a promise-based confirm dialog rendered with a <Modal>
//
// Both are also perfectly fine on native, so screens can use one code path.
// ─────────────────────────────────────────────────────────────────────────────

type ToastKind = 'success' | 'error' | 'info' | 'warn';
type ToastItem = { id: number; kind: ToastKind; title: string; message?: string };

type ConfirmOpts = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ToastApi = {
  show: (kind: ToastKind, title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  warn: (title: string, message?: string) => void;
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
};

const ToastCtx = createContext<ToastApi | null>(null);

// Module-level bridge so non-React code (e.g. the api layer, or a helper that
// isn't a component) can still fire a toast without threading context through.
let bridge: ToastApi | null = null;

/** Imperative access to the toast API from anywhere (after ToastProvider mounts). */
export const toast = {
  show: (kind: ToastKind, title: string, message?: string) => bridge?.show(kind, title, message),
  success: (title: string, message?: string) => bridge?.success(title, message),
  error: (title: string, message?: string) => bridge?.error(title, message),
  info: (title: string, message?: string) => bridge?.info(title, message),
  warn: (title: string, message?: string) => bridge?.warn(title, message),
};

/** Promise-based confirm that works on web and native. Resolves true/false. */
export function confirm(opts: ConfirmOpts): Promise<boolean> {
  if (bridge) return bridge.confirm(opts);
  // Provider not mounted yet — fail safe by not performing destructive actions.
  return Promise.resolve(false);
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const KIND_STYLE: Record<ToastKind, { icon: keyof typeof Ionicons.glyphMap; tint: string }> = {
  success: { icon: 'checkmark-circle', tint: colors.success },
  error:   { icon: 'alert-circle',     tint: colors.danger },
  info:    { icon: 'information-circle', tint: colors.info },
  warn:    { icon: 'warning',          tint: colors.warning },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<
    (ConfirmOpts & { resolve: (v: boolean) => void }) | null
  >(null);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setItems(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((kind: ToastKind, title: string, message?: string) => {
    const id = nextId.current++;
    setItems(prev => [...prev, { id, kind, title, message }]);
    // Errors linger a bit longer so they can be read; successes are quick.
    const ttl = kind === 'error' ? 5000 : 3000;
    setTimeout(() => remove(id), ttl);
  }, [remove]);

  const api: ToastApi = React.useMemo(() => ({
    show,
    success: (t, m) => show('success', t, m),
    error:   (t, m) => show('error', t, m),
    info:    (t, m) => show('info', t, m),
    warn:    (t, m) => show('warn', t, m),
    confirm: (opts: ConfirmOpts) =>
      new Promise<boolean>(resolve => setConfirmState({ ...opts, resolve })),
  }), [show]);

  // Expose the imperative bridge for the whole app lifetime.
  useEffect(() => { bridge = api; return () => { if (bridge === api) bridge = null; }; }, [api]);

  const closeConfirm = useCallback((result: boolean) => {
    setConfirmState(prev => { prev?.resolve(result); return null; });
  }, []);

  return (
    <ToastCtx.Provider value={api}>
      {children}

      {/* Toast stack — top-anchored, non-blocking, tap to dismiss. */}
      <View pointerEvents="box-none" style={styles.stack}>
        {items.map(item => <ToastRow key={item.id} item={item} onDismiss={() => remove(item.id)} />)}
      </View>

      {/* Confirm dialog — a real modal so callbacks fire on web. */}
      <Modal visible={!!confirmState} transparent animationType="fade" onRequestClose={() => closeConfirm(false)}>
        <View style={styles.confirmBg}>
          <View style={[styles.confirmCard, shadow.float]}>
            <Text style={styles.confirmTitle}>{confirmState?.title}</Text>
            {confirmState?.message ? <Text style={styles.confirmMsg}>{confirmState.message}</Text> : null}
            <View style={styles.confirmRow}>
              <TouchableOpacity style={[styles.confirmBtn, styles.cancelBtn]} onPress={() => closeConfirm(false)}>
                <Text style={styles.cancelText}>{confirmState?.cancelLabel ?? 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, confirmState?.destructive ? styles.dangerBtn : styles.okBtn]}
                onPress={() => closeConfirm(true)}
              >
                <Text style={styles.okText}>{confirmState?.confirmLabel ?? 'Confirm'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ToastCtx.Provider>
  );
}

function ToastRow({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: Platform.OS !== 'web', speed: 18, bounciness: 6 }).start();
  }, [anim]);
  const { icon, tint } = KIND_STYLE[item.kind];
  return (
    <Animated.View
      style={[
        styles.toast, shadow.float,
        { borderLeftColor: tint, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] },
      ]}
    >
      <Ionicons name={icon} size={20} color={tint} />
      <View style={{ flex: 1 }}>
        <Text style={styles.toastTitle}>{item.title}</Text>
        {item.message ? <Text style={styles.toastMsg} numberOfLines={4}>{item.message}</Text> : null}
      </View>
      <TouchableOpacity onPress={onDismiss} hitSlop={8}>
        <Ionicons name="close" size={18} color={colors.muted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute', top: Platform.OS === 'web' ? 16 : 48, left: 0, right: 0,
    alignItems: 'center', gap: spacing.sm, zIndex: 9999, paddingHorizontal: spacing.lg,
  },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.md, borderLeftWidth: 4,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    width: '100%', maxWidth: 460,
  },
  toastTitle: { ...font.title, color: colors.ink },
  toastMsg: { ...font.label, color: colors.slate, marginTop: 1, textTransform: 'none', letterSpacing: 0 },

  confirmBg: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  confirmCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, width: '100%', maxWidth: 420, gap: spacing.sm },
  confirmTitle: { ...font.h3, color: colors.ink },
  confirmMsg: { ...font.body, color: colors.slate, marginTop: 2 },
  confirmRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  confirmBtn: { flex: 1, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: colors.surfaceAlt },
  okBtn: { backgroundColor: colors.primary },
  dangerBtn: { backgroundColor: colors.danger },
  cancelText: { ...font.title, color: colors.ink },
  okText: { ...font.title, color: '#fff' },
});