import { Entity, Column } from 'typeorm';
import { TenantEntity } from '../../common/entities/base.entity';

export interface FamilyChild {
  name: string;
  age: string;
  gender: string;
}

@Entity('families')
export class Family extends TenantEntity {
  @Column()
  familyName: string;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  // Head of household info
  @Column({ type: 'varchar', nullable: true })
  headName: string | null;

  @Column({ type: 'varchar', nullable: true })
  headPhone: string | null;

  @Column({ type: 'varchar', nullable: true })
  headOccupation: string | null;

  // Spouse info
  @Column({ type: 'varchar', nullable: true })
  spouseName: string | null;

  @Column({ type: 'varchar', nullable: true })
  spousePhone: string | null;

  @Column({ type: 'varchar', nullable: true })
  spouseOccupation: string | null;

  // Children — stored as JSON; can be promoted to linked Member records later
  @Column({ type: 'jsonb', default: [] })
  children: FamilyChild[];

  @Column({ default: 0 })
  numberOfChildren: number;

  // Audit
  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;
}
