import { Entity, Column } from 'typeorm';
import { TenantEntity } from '../../common/entities/base.entity';

@Entity('service_schedules')
export class ServiceEvent extends TenantEntity {
  @Column()
  name: string;

  // For recurring: "Sundays", "Wednesdays" etc.
  @Column({ type: 'varchar', nullable: true })
  day: string | null;

  @Column()
  time: string;

  @Column({ type: 'varchar', nullable: true })
  endTime: string | null;

  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  @Column({ type: 'varchar', default: 'in-person' })
  format: string;

  // 'regular' = weekly recurring, 'custom' = one-time event
  @Column({ type: 'varchar', default: 'regular' })
  kind: string;

  @Column({ type: 'varchar', nullable: true })
  eventType: string | null;

  // Date for one-time events (DD/MM/YYYY)
  @Column({ type: 'varchar', nullable: true })
  eventDate: string | null;
}
