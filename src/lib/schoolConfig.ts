import { useAuth } from '@/lib/auth';

// Sensible defaults for a school that hasn't configured its master data yet.
export const DEFAULT_CLASSES = ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
export const DEFAULT_SECTIONS = ['A', 'B', 'C', 'D', 'E'];
export const DEFAULT_WORKING_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Single source of truth for school master data across every screen.
 *
 * Screens used to hardcode `const CLASSES = [...]`, so a school with a
 * different class scheme saw wrong options everywhere. This reads the
 * configured lists (editable in Settings → School Setup) and falls back to
 * the defaults only when the school hasn't set them yet.
 */
export function useSchoolConfig() {
  const { school } = useAuth();

  const classes: string[] = school?.classes?.length ? school.classes : DEFAULT_CLASSES;
  const sections: string[] = school?.sections?.length ? school.sections : DEFAULT_SECTIONS;
  const workingDays: string[] = school?.workingDays?.length ? school.workingDays : DEFAULT_WORKING_DAYS;

  // `school` is null when the session was created before /login returned it.
  // The fallbacks above then make every picker show DEFAULT_CLASSES, which
  // looks exactly like the lists are hardcoded — the configured values are
  // never consulted because there is no school object to read them from.
  // Surfacing this lets screens warn instead of silently showing wrong data.
  const isUsingDefaults = !school?.classes?.length;
  const schoolLoaded = !!school?._id;

  if (__DEV__ && !schoolLoaded) {
    console.warn(
      '[useSchoolConfig] No school in session — falling back to DEFAULT_CLASSES/SECTIONS. ' +
      'Class and section pickers will not reflect School Setup until the session carries a school.',
    );
  }

  return {
    classes,
    sections,
    workingDays,
    isUsingDefaults,
    schoolLoaded,
    academicYear: school?.academicYear as string | undefined,
    // Chip pickers that allow "all"/"any" need a leading blank option.
    classesWithBlank: ['', ...classes],
    sectionsWithBlank: ['', ...sections],
    school,
  };
}

/**
 * Format a Date as YYYY-MM-DD in the DEVICE'S LOCAL timezone.
 *
 * Do NOT use `toISOString().slice(0,10)` for calendar dates: it converts to
 * UTC first, so in IST (UTC+5:30) a local midnight becomes the *previous*
 * day. That silently shifted attendance dates back by one.
 */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
