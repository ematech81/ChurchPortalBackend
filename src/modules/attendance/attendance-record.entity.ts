import { Entity, Column, Index } from 'typeorm';
import { TenantEntity } from '../../common/entities/base.entity';

@Entity('attendance_records')
@Index(['churchId', 'serviceEventId', 'memberId'], { unique: true })
export class AttendanceRecord extends TenantEntity {
  @Column({ type: 'uuid' })
  serviceEventId: string;

  @Column({ type: 'uuid', nullable: true })
  memberId: string | null;

  @Column({ type: 'varchar', nullable: true })
  visitorName: string | null;

  @Column({ type: 'timestamp', nullable: true })
  checkedInAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  checkedInBy: string | null;
}
