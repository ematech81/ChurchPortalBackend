import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('churches')
export class Church extends BaseEntity {
  @Column()
  name: string;

  @Index({ unique: true })
  @Column()
  slug: string;

  @Column({ type: 'varchar', nullable: true })
  logoUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Column({ type: 'varchar', nullable: true })
  state: string | null;

  @Column({ type: 'varchar', nullable: true })
  country: string | null;

  @Column({ type: 'varchar', nullable: true })
  denomination: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  website: string | null;

  @Column({ type: 'jsonb', default: {} })
  settings: Record<string, unknown>;

  @Column({ type: 'varchar', nullable: true })
  subscriptionPlan: string | null;

  @Column({ type: 'varchar', nullable: true })
  subscriptionStatus: string | null;

  @Column({ type: 'timestamp', nullable: true })
  trialEndsAt: Date | null;

  // Self-referencing FK: branch churches point to their parent/HQ church
  @Column({ type: 'uuid', nullable: true })
  parentChurchId: string | null;

  @Column({ default: true })
  isActive: boolean;
}
