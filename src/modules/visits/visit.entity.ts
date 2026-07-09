import { Entity, Column } from 'typeorm';
import { TenantEntity } from '../../common/entities/base.entity';

export enum VisitStatus {
  SCHEDULED = 'scheduled',
  COMPLETED = 'completed',
  MISSED = 'missed',
}

@Entity('visits')
export class Visit extends TenantEntity {
  @Column({ type: 'uuid' })
  workerId: string;

  @Column({ type: 'uuid', nullable: true })
  memberId: string | null;

  @Column()
  title: string;

  @Column()
  scheduledAt: Date;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number | null;

  @Column({ type: 'varchar', nullable: true })
  context: string | null;

  @Column({ type: 'enum', enum: VisitStatus, default: VisitStatus.SCHEDULED })
  status: VisitStatus;
}
