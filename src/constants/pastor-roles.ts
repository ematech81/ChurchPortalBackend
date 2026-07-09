import { ChurchRole } from '../types';

/**
 * Canonical church roles that classify a member as a pastor.
 * Every query, filter, and auto-sync rule must reference this — no inline arrays.
 */
export const PASTOR_CHURCH_ROLES: string[] = [ChurchRole.PASTOR, ChurchRole.BRANCH_PASTOR];
