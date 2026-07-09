export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  SENIOR_PASTOR = 'senior_pastor',    // HQ / parent church — sees all branches
  BRANCH_PASTOR = 'branch_pastor',    // Single branch — scoped visibility
  ADMIN_PASTOR = 'admin_pastor',
  DEPARTMENT_HEAD = 'department_head',
  CELL_LEADER = 'cell_leader',
  FOLLOW_UP_WORKER = 'follow_up_worker',
  USHER = 'usher',
  FINANCE_OFFICER = 'finance_officer',
  MEMBER = 'member',
}

export enum MemberStatus {
  VISITOR = 'visitor',
  FIRST_TIMER = 'first_timer',
  NEW_CONVERT = 'new_convert',
  MEMBER = 'member',
  WORKER = 'worker',
  MINISTER = 'minister',
  PASTOR = 'pastor',
  BACKSLIDDEN = 'backslidden',
  TRANSFERRED = 'transferred',
  DECEASED = 'deceased',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

export enum MaritalStatus {
  SINGLE = 'single',
  MARRIED = 'married',
  DIVORCED = 'divorced',
  WIDOWED = 'widowed',
}

export enum BaptismStatus {
  NONE = 'none',
  WATER = 'water',
  HOLY_SPIRIT = 'holy_spirit',
  BOTH = 'both',
}

export enum SubscriptionPlan {
  STARTER = 'starter',
  GROWTH = 'growth',
  PARISH = 'parish',
  MULTI_BRANCH = 'multi_branch',
  ENTERPRISE = 'enterprise',
}

export enum SubscriptionStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum MembershipCategory {
  NEW_MEMBER = 'new_member',
  EXISTING_MEMBER = 'existing_member',
  PASTOR_REGISTRATION = 'pastor_registration',
  YOUTH_MEMBER = 'youth_member',
  CHILDREN_MEMBER = 'children_member',
  FAMILY_REGISTRATION = 'family_registration',
}

export enum ChurchRole {
  BRANCH_PASTOR = 'branch_pastor',
  PASTOR = 'pastor',
  DEPARTMENTAL_LEADER = 'departmental_leader',
  WORKER = 'worker',
  MEMBER = 'member',
  DEACON = 'deacon',
  ELDER = 'elder',
  OTHER = 'other',
}

export enum PastoralPosition {
  YOUTH_PASTOR = 'youth_pastor',
  ASSOCIATE_PASTOR = 'associate_pastor',
  ASSISTANT_PASTOR = 'assistant_pastor',
  PRAYER_PASTOR = 'prayer_pastor',
  EVANGELISM_PASTOR = 'evangelism_pastor',
}

export enum AgeRange {
  ZERO_TO_FIVE = '0-5',
  SIX_TO_TWELVE = '6-12',
  THIRTEEN_TO_SEVENTEEN = '13-17',
}
