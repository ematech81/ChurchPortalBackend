import { Entity, Column, Index, BeforeInsert } from 'typeorm';
import { TenantEntity } from '../../common/entities/base.entity';
import {
  MemberStatus, Gender, MaritalStatus, BaptismStatus,
  MembershipCategory, ChurchRole, PastoralPosition, AgeRange,
} from '@/types';

@Entity('members')
@Index(['churchId', 'phone'])
@Index(['churchId', 'email'])
@Index(['churchId', 'memberId'])
export class Member extends TenantEntity {
  // ── Auto-generated membership ID ─────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  memberId: string | null;

  // ── Personal Details ──────────────────────────────────────────────────────
  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ type: 'varchar', nullable: true })
  middleName: string | null;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender: Gender | null;

  @Column({ type: 'timestamp', nullable: true })
  dateOfBirth: Date | null;

  @Column({ type: 'enum', enum: MaritalStatus, nullable: true })
  maritalStatus: MaritalStatus | null;

  @Column({ type: 'varchar', nullable: true })
  occupation: string | null;

  @Column({ type: 'varchar', nullable: true })
  photoUrl: string | null;

  @Column()
  phone: string;

  @Column({ type: 'varchar', nullable: true })
  alternatePhone: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Column({ type: 'varchar', nullable: true })
  state: string | null;

  @Column({ type: 'varchar', nullable: true })
  preferredLanguage: string | null;

  // ── Emergency Contact ─────────────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  emergencyContactName: string | null;

  @Column({ type: 'varchar', nullable: true })
  emergencyContactPhone: string | null;

  // ── Spiritual Status ──────────────────────────────────────────────────────
  @Column({ type: 'enum', enum: MemberStatus, default: MemberStatus.FIRST_TIMER })
  status: MemberStatus;

  @Column({ type: 'enum', enum: BaptismStatus, default: BaptismStatus.NONE })
  baptismStatus: BaptismStatus;

  @Column({ type: 'timestamp', nullable: true })
  baptismDate: Date | null;

  @Column({ default: false })
  holyGhostBaptism: boolean;

  @Column({ type: 'timestamp', nullable: true })
  salvationDate: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  membershipDate: Date | null;

  // ── Membership Category ───────────────────────────────────────────────────
  @Column({ type: 'enum', enum: MembershipCategory, nullable: true })
  membershipCategory: MembershipCategory | null;

  // ── Church Role & Leadership ──────────────────────────────────────────────
  @Column({ type: 'enum', enum: ChurchRole, nullable: true })
  churchRole: ChurchRole | null;

  @Column({ type: 'enum', enum: PastoralPosition, nullable: true })
  pastoralPosition: PastoralPosition | null;

  @Column({ type: 'varchar', nullable: true })
  customRole: string | null;

  // ── Department ────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  departmentName: string | null;

  @Column({ type: 'varchar', nullable: true })
  departmentRole: string | null;

  @Column({ type: 'timestamp', nullable: true })
  departmentJoinedDate: Date | null;

  // ── Children fields (when membershipCategory = CHILDREN_MEMBER) ───────────
  @Column({ type: 'varchar', nullable: true })
  parentGuardianName: string | null;

  @Column({ type: 'varchar', nullable: true })
  parentGuardianPhone: string | null;

  @Column({ type: 'enum', enum: AgeRange, nullable: true })
  ageRange: AgeRange | null;

  @Column({ type: 'varchar', nullable: true })
  pickupAuthorization: string | null;

  // ── Family Registration ───────────────────────────────────────────────────
  @Column({ type: 'uuid', nullable: true })
  familyId: string | null;

  // Legacy household fields kept for compatibility
  @Column({ type: 'uuid', nullable: true })
  householdId: string | null;

  @Column({ type: 'varchar', nullable: true })
  householdRole: string | null;

  // ── Groups & Tags ─────────────────────────────────────────────────────────
  @Column({ type: 'uuid', nullable: true })
  cellGroupId: string | null;

  @Column({ type: 'text', array: true, default: [] })
  tags: string[];

  // ── Communication Preferences ─────────────────────────────────────────────
  @Column({ default: true })
  whatsappOptIn: boolean;

  @Column({ default: true })
  smsOptIn: boolean;

  // ── First Timer / Decision tracking ───────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  decisionType: string | null;

  @Column({ type: 'uuid', nullable: true })
  invitedBy: string | null;

  // ── Audit ─────────────────────────────────────────────────────────────────
  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ type: 'uuid', nullable: true })
  updatedById: string | null;

  // ── Geo (optional, for map features) ─────────────────────────────────────
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number | null;

  // ── Extensibility ─────────────────────────────────────────────────────────
  @Column({ type: 'jsonb', default: {} })
  customFields: Record<string, unknown>;
}
