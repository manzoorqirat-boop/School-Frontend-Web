import { SessionUser } from './api';

// Ported from the web app's PRIVILEGES map + can(). Same role→privilege table,
// same fail-closed behaviour. Superadmin bypasses everything.
export const PRIVILEGES: Record<string, string[]> = {
  'student:view': ['teacher', 'accountant', 'principal', 'school_admin', 'superadmin', 'parent'],
  'student:create': ['school_admin', 'principal', 'superadmin'],
  'student:update': ['school_admin', 'principal', 'superadmin'],
  'student:delete': ['school_admin', 'superadmin'],
  'attendance:view': ['teacher', 'principal', 'school_admin', 'superadmin', 'parent', 'student'],
  'attendance:mark': ['teacher', 'principal', 'school_admin', 'superadmin'],
  'attendance:report': ['teacher', 'principal', 'school_admin', 'superadmin'],
  'fee:view': ['accountant', 'principal', 'school_admin', 'superadmin', 'parent', 'student'],
  'fee:create': ['accountant', 'school_admin', 'superadmin'],
  'fee:manage': ['accountant', 'school_admin', 'superadmin'],
  'fee:collect': ['accountant', 'school_admin', 'superadmin'],
  'fee:report': ['accountant', 'principal', 'school_admin', 'superadmin'],
  'exam:view': ['teacher', 'principal', 'school_admin', 'superadmin', 'parent', 'student'],
  'exam:create': ['teacher', 'principal', 'school_admin', 'superadmin'],
  'exam:grade': ['teacher', 'principal', 'school_admin', 'superadmin'],
  'exam:publish': ['principal', 'school_admin', 'superadmin'],
  'timetable:view': ['teacher', 'accountant', 'principal', 'school_admin', 'superadmin', 'student', 'parent'],
  'timetable:manage': ['principal', 'school_admin', 'superadmin'],
  'teacher_attendance:mark': ['principal', 'school_admin', 'superadmin'],
  'teacher_attendance:report': ['principal', 'school_admin', 'superadmin'],
  'teacher:view': ['principal', 'school_admin', 'superadmin', 'accountant'],
  'teacher:manage': ['school_admin', 'superadmin'],
  'payroll:view': ['teacher', 'accountant', 'principal', 'school_admin', 'superadmin'],
  'payroll:manage': ['accountant', 'school_admin', 'superadmin'],
  'payroll:process': ['accountant', 'school_admin', 'superadmin'],
  'school:view': ['school_admin', 'superadmin', 'principal'],
  'school:manage': ['superadmin'],
  'school:settings': ['school_admin', 'superadmin'],
  'user:manage': ['school_admin', 'superadmin'],
  'audit:view': ['school_admin', 'superadmin'],
};

export function can(user: SessionUser | null, privilege: string): boolean {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  const roles = PRIVILEGES[privilege];
  return roles ? roles.includes(user.role) : false;
}
