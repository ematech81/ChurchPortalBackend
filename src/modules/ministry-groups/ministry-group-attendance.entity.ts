import { Entity, Column } from 'typeorm';
import { TenantEntity } from '../../common/entities/base.entity';

@Entity('ministry_group_attendance')
export class MinistryGroupAttendance extends TenantEntity {
  @Column({ type: 'uuid' })
  groupId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int', default: 0 })
  presentCount: number;

  @Column({ type: 'int', default: 0 })
  totalCount: number;
}
