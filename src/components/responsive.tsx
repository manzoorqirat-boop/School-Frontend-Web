import React from 'react';
import { View, useWindowDimensions, ViewStyle } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Responsive width helpers.
//
// The app was laid out for a phone, where the viewport IS the content width.
// On a desktop browser the same views stretch to ~1900px: percentage-based
// tiles (dashboard TILE = '31%') become ~600px squares, list rows run edge to
// edge, and form fields span the whole screen.
//
// Rather than rewrite 20 screens, we cap and centre the content column. Every
// percentage inside then resolves against a sane width and the existing
// layouts work unchanged.
//
// Native is unaffected: useWindowDimensions returns the device width, which is
// always below the breakpoints, so maxWidth never engages.
// ─────────────────────────────────────────────────────────────────────────────

/** Content column caps. Wider for data screens, narrower for reading/forms. */
export const MAX_W = {
  /** Dashboards, list screens, anything grid-like. */
  wide: 1100,
  /** Forms and detail views — long lines are hard to scan. */
  form: 720,
} as const;

export function useBreakpoint() {
  const { width } = useWindowDimensions();
  return {
    width,
    isPhone: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
  };
}

/**
 * Centres children in a capped-width column.
 *
 * Use as the contentContainerStyle wrapper inside an existing ScrollView, or
 * as a plain wrapper View. Keeps horizontal padding so content never touches
 * the window edge on narrow screens.
 */
export function Container({
  children, max = MAX_W.wide, style,
}: {
  children: React.ReactNode;
  max?: number;
  style?: ViewStyle | ViewStyle[];
}) {
  return (
    <View style={[{ width: '100%', maxWidth: max, alignSelf: 'center' }, style]}>
      {children}
    </View>
  );
}

/**
 * Column count for card grids, by viewport. Screens that render a wrapping
 * grid can use this instead of a hardcoded percentage.
 */
export function useGridColumns(opts?: { phone?: number; tablet?: number; desktop?: number }) {
  const { isPhone, isTablet } = useBreakpoint();
  const phone = opts?.phone ?? 3;
  const tablet = opts?.tablet ?? 4;
  const desktop = opts?.desktop ?? 6;
  return isPhone ? phone : isTablet ? tablet : desktop;
}

/** Percentage width string for a grid item, accounting for gaps. */
export function gridItemWidth(columns: number): `${number}%` {
  // Leave ~2% total for gaps between items.
  const pct = (100 - (columns - 1) * 2) / columns;
  return `${pct}%` as `${number}%`;
}
