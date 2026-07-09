import { Entity, Column } from 'typeorm';
import { TenantEntity } from '../../common/entities/base.entity';

@Entity('cell_groups')
export class CellGroup extends TenantEntity {
  @Column()
  name: string;

  @Column({ type: 'uuid', nullable: true })
  leaderId: string | null;

  @Column({ type: 'varchar', nullable: true })
  meetingDay: string | null;

  @Column({ type: 'varchar', nullable: true })
  meetingTime: string | null;

  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  @Column({ type: 'uuid', nullable: true })
  parentCellId: string | null;

  @Column({ default: true })
  isActive: boolean;
}
