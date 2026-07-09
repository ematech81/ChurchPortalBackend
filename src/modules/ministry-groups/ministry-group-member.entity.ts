import { Entity, Column } from 'typeorm';
import { TenantEntity } from '../../common/entities/base.entity';

@Entity('ministry_group_members')
export class MinistryGroupMember extends TenantEntity {
  @Column({ type: 'uuid' })
  groupId: string;

  @Column({ type: 'uuid' })
  memberId: string;

  @Column({ type: 'varchar', default: 'Member' })
  roleTitle: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  joinedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  leftAt: Date | null;
}
