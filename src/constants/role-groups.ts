import { UserRole } from '../types';

/**
 * Role groups used with @Roles(). Keep every access rule expressed through these
 * so permissions can be audited in one place.
 */

/** Pastors and top-level administrators. */
export const ADMIN_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.SENIOR_PASTOR,
  UserRole.BRANCH_PASTOR,
  UserRole.ADMIN_PASTOR,
];

/** HQ-level only (branch management, pastor assignment, billing). */
export const SENIOR_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.SENIOR_PASTOR];

/** Anyone who may view member records and operational data. */
export const STAFF_ROLES: UserRole[] = [
  ...ADMIN_ROLES,
  UserRole.DEPARTMENT_HEAD,
  UserRole.CELL_LEADER,
  UserRole.USHER,
  UserRole.FINANCE_OFFICER,
];

/** May create/edit member, family, cell and group records. */
export const MEMBER_WRITE_ROLES: UserRole[] = [
  ...ADMIN_ROLES,
  UserRole.DEPARTMENT_HEAD,
  UserRole.CELL_LEADER,
];

/** May take attendance. */
export const ATTENDANCE_ROLES: UserRole[] = [
  ...ADMIN_ROLES,
  UserRole.DEPARTMENT_HEAD,
  UserRole.CELL_LEADER,
  UserRole.USHER,
];

/** May see or record giving. */
export const FINANCE_ROLES: UserRole[] = [...ADMIN_ROLES, UserRole.FINANCE_OFFICER];
