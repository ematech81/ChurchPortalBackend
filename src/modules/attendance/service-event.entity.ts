import { Entity, Column } from 'typeorm';
import { TenantEntity } from '../../common/entities/base.entity';

export enum ServiceType {
  SUNDAY = 'sunday',
  MIDWEEK = 'midweek',
  CELL = 'cell',
  SPECIAL = 'special',
  CRUSADE = 'crusade',
}

@Entity('service_events')
export class ServiceEvent extends TenantEntity {
  @Column()
  title: string;

  @Column({ type: 'enum', enum: ServiceType })
  type: ServiceType;

  @Column()
  date: Date;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;
}
