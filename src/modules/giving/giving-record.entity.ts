import { Entity, Column, Index } from 'typeorm';
import { TenantEntity } from '../../common/entities/base.entity';

export enum GivingFund {
  TITHE = 'tithe',
  OFFERING = 'offering',
  BUILDING = 'building',
  MISSIONS = 'missions',
  WELFARE = 'welfare',
  SEED = 'seed',
  PLEDGE = 'pledge',
  OTHER = 'other',
}

@Entity('giving_records')
@Index(['churchId', 'memberId'])
export class GivingRecord extends TenantEntity {
  @Column({ type: 'uuid', nullable: true })
  memberId: string | null;

  @Column({ type: 'enum', enum: GivingFund })
  fund: GivingFund;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ default: 'NGN' })
  currency: string;

  @Column()
  date: Date;

  @Column({ type: 'varchar', nullable: true })
  reference: string | null;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @Column({ default: false })
  isAnonymous: boolean;

  @Column({ type: 'varchar', nullable: true })
  recordedBy: string | null;
}
