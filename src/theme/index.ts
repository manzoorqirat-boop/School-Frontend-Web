// QMSoft School — mobile design system (refined minimal).
// Linear / Things 3 aesthetic: near-monochrome canvas, generous whitespace,
// hairline borders over heavy shadows, one disciplined purple accent, precise
// type. Role identity is a small colored dot/label, NOT a full gradient header.

export const colors = {
  primary: '#5B34E0',
  primaryDark: '#4526B8',
  primarySoft: '#EEEAFC',

  bg: '#FBFBFD',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F4F7',

  ink: '#18181B',
  slate: '#52525B',
  muted: '#A1A1AA',

  line: '#ECECF0',
  lineStrong: '#E0E0E6',

  success: '#12A150',
  warning: '#C77700',
  danger: '#E5484D',
  info: '#3B82F6',

  white: '#FFFFFF',
  black: '#000000',

  // legacy accent names still referenced by not-yet-migrated screens
  violet: '#6D28D9', sky: '#3B82F6', emerald: '#12A150', amber: '#C77700',
  rose: '#BE123C', pink: '#BE123C', indigo: '#4338CA', primaryLight: '#A78BFA',
  card: '#FFFFFF',

  role: {
    superadmin: '#B45309', school_admin: '#5B34E0', principal: '#4338CA',
    accountant: '#B45309', teacher: '#0F766E', parent: '#BE123C', student: '#6D28D9',
  } as Record<string, string>,

  // Per-module accents. The app is deliberately near-monochrome, so colour is
  // reserved for *identity*: each module keeps one hue across its dashboard
  // tile and screen header, which makes the grid scannable by colour instead
  // of forcing users to read all twelve labels. Everything else stays quiet.
  module: {
    students:          '#5B34E0',   // violet  — the core record
    promote:           '#7C3AED',   // violet light — related to students
    attendance:        '#0F766E',   // teal    — daily routine
    'staff-attendance':'#0D9488',   // teal light
    fees:              '#12A150',   // green   — money in
    'fee-structures':  '#059669',   // green deep
    payroll:           '#B45309',   // amber   — money out
    exams:             '#4338CA',   // indigo  — assessment
    'exam-config':     '#3730A3',   // indigo deep — exam master data
    marks:             '#4F46E5',   // indigo light
    'report-cards':    '#6366F1',   // indigo soft
    timetable:         '#0284C7',   // blue    — scheduling
    'my-classes':      '#0369A1',   // blue deep
    reports:           '#7E22CE',   // purple  — analytics
    users:             '#BE123C',   // rose    — people admin
    privileges:        '#9F1239',   // rose deep — sensitive
    polls:             '#C2410C',   // orange  — engagement
    audit:             '#52525B',   // slate   — system log
    settings:          '#52525B',
    'school-setup':    '#3F3F46',
    superadmin:        '#B45309',
    portal:            '#5B34E0',
  } as Record<string, string>,
};

/** Accent for a module key; falls back to the primary brand colour. */
export function moduleColor(key?: string): string {
  return (key && colors.module[key]) || colors.primary;
}

export function roleAccent(role?: string): string {
  return colors.role[role ?? ''] ?? colors.primary;
}
export function roleLabel(role?: string): string {
  const map: Record<string, string> = {
    superadmin: 'Platform Admin', school_admin: 'School Admin', principal: 'Principal',
    accountant: 'Accountant', teacher: 'Teacher', parent: 'Parent', student: 'Student',
  };
  return map[role ?? ''] ?? 'Member';
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 };
export const radius = { sm: 6, md: 10, lg: 14, xl: 18, pill: 999 };

export const font = {
  display: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.6 },
  h1: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4 },
  h2: { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.3 },
  h3: { fontSize: 16, fontWeight: '600' as const, letterSpacing: -0.2 },
  title: { fontSize: 15, fontWeight: '600' as const, letterSpacing: -0.1 },
  body: { fontSize: 14, fontWeight: '400' as const },
  bodyMedium: { fontSize: 14, fontWeight: '500' as const },
  label: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.3 },
};

export const shadow = {
  none: {},
  subtle: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  card: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  float: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  sheet: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
};

// Back-compat shims for screens not yet migrated (flat, no gradients now).
//
// NOTE: `gradient` used to be [surface, surface] — i.e. white-to-white. Ten
// GradientButtons across seven screens pass `rt.gradient` as their fill
// ("Load", "Save Attendance", "Save Marks", "Save School Setup", the promote
// actions…), so every one of them rendered as white text on a white pill —
// an invisible button. The role identity is expressed as a small coloured dot
// elsewhere, so the button fill should just be the brand colour.
export const roleTheme: Record<string, { gradient: [string, string]; accent: string; label: string }> =
  Object.fromEntries(Object.keys(colors.role).map(r => [r, {
    gradient: [colors.primary, colors.primaryDark] as [string, string],
    accent: colors.role[r], label: roleLabel(r),
  }]));
export function themeForRole(role?: string) {
  return roleTheme[role ?? ''] ?? { gradient: [colors.primary, colors.primaryDark] as [string, string], accent: colors.primary, label: 'Member' };
}
export const gradients = {
  brand: [colors.primary, colors.primaryDark] as [string, string],
  brandVivid: [colors.primary, colors.primaryDark] as [string, string],
  sunrise: [colors.primary, colors.primaryDark] as [string, string],
  ocean: [colors.primary, colors.primaryDark] as [string, string],
  mint: [colors.primary, colors.primaryDark] as [string, string],
};
