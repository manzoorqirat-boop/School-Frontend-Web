import { Stack } from 'expo-router';

// Layout for the (app) route group.
//
// This file used to be a VERBATIM COPY of the root layout — SafeAreaProvider +
// I18nProvider + AuthProvider + its own Guard + its own full-screen spinner.
// Because expo-router nests layouts, that mounted a SECOND AuthProvider inside
// the first, and the two held completely independent state:
//
//   app/_layout.tsx        -> AuthProvider A -> Guard A -> <Stack>
//     app/(app)/_layout.tsx -> AuthProvider B -> Guard B -> <Stack>
//       app/(app)/settings.tsx
//
// useAuth() resolves to the NEAREST provider, so every screen in this group
// talked to provider B while Guard A — the one that actually owns the
// (auth)/(app) redirect — watched provider A.
//
// Signing out therefore cleared B's user but left A's untouched:
//   * Guard A still saw a logged-in user, so it never routed to /login.
//   * Guard B saw user=null and rendered ITS spinner, nested inside A's Stack
//     which never unmounted.
// The result was the permanent purple spinner after sign-out.
//
// A nested group layout must NOT re-create app-wide providers. Auth, i18n and
// safe-area context all live once, at the root. This file only declares the
// stack for the group — mirroring app/(auth)/_layout.tsx, which was always
// correct.
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
