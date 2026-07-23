import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/components/toast';
import { I18nProvider } from '@/i18n';
import { homeForRole } from '@/lib/api';
import { View, ActivityIndicator } from 'react-native';
import { colors } from '@/theme';

// Route guard: redirects between (auth) and (app) based on session.
function Guard() {
  const { ready, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // `segments` is a dependency AND changes as a result of router.replace(), so
  // a naive effect re-fires mid-navigation and issues a second replace. Each
  // one remounts the screen — that is the sign-out flicker. Remember the last
  // route we sent the user to and never repeat it. (Mobile already had this;
  // web did not.)
  const lastNav = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === '(auth)';

    // Already where we belong — clear the latch so a future genuine change
    // (a real sign-in or sign-out) can navigate again.
    if ((!user && inAuth) || (user && !inAuth)) { lastNav.current = null; return; }

    const target = user ? (homeForRole(user.role) as string) : '/(auth)/login';
    if (lastNav.current === target) return;      // replace already in flight
    lastNav.current = target;
    router.replace(target as any);
  }, [ready, user, segments, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <ToastProvider>
            <StatusBar style="light" />
            <Guard />
          </ToastProvider>
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
