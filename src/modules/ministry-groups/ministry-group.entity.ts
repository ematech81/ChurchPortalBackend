import { Entity, Column } from 'typeorm';
import { TenantEntity } from '../../common/entities/base.entity';

export enum GroupStatus {
  ACTIVE     = 'active',
  RECRUITING = 'recruiting',
  CORE       = 'core',
  INACTIVE   = 'inactive',
  DRAFT      = 'draft',
}

@Entity('ministry_groups')
export class MinistryGroup extends TenantEntity {
  @Column({ type: 'uuid' })
  categoryId: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  // Member ID of the group leader
  @Column({ type: 'uuid', nullable: true })
  leaderId: string | null;

  @Column({ type: 'varchar', nullable: true })
  leaderRoleTitle: string | null;

  // Branch church UUID (same as or child of the pastor's churchId)
  @Column({ type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ type: 'varchar', nullable: true })
  cadence: string | null;

  @Column({ type: 'varchar', nullable: true })
  meetingDay: string | null;

  @Column({ type: 'varchar', nullable: true })
  meetingTime: string | null;

  @Column({ type: 'enum', enum: GroupStatus, default: GroupStatus.ACTIVE })
  status: GroupStatus;

  @Column({ type: 'varchar', nullable: true })
  coverImageUrl: string | null;

  @Column({ default: false })
  isDraft: boolean;
}
