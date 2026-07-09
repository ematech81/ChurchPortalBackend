import { Entity, Column } from 'typeorm';
import { TenantEntity } from '../../common/entities/base.entity';

@Entity('households')
export class Household extends TenantEntity {
  @Column()
  name: string;

  @Column({ type: 'uuid', nullable: true })
  headMemberId: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;
}
