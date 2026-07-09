import { Entity, Column } from 'typeorm';
import { TenantEntity } from '../../common/entities/base.entity';

export enum JourneyStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  PAUSED = 'paused',
  ABANDONED = 'abandoned',
}

@Entity('follow_up_journeys')
export class FollowUpJourney extends TenantEntity {
  @Column({ type: 'uuid' })
  memberId: string;

  @Column({ type: 'uuid', nullable: true })
  assignedWorkerId: string | null;

  @Column({ type: 'enum', enum: JourneyStatus, default: JourneyStatus.ACTIVE })
  status: JourneyStatus;

  @Column({ type: 'varchar', nullable: true })
  decisionType: string | null;

  @Column({ type: 'jsonb', default: {} })
  meta: Record<string, unknown>;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  journeyStage: string | null;

  @Column({ type: 'int', default: 0 })
  journeyProgress: number;

  @Column({ default: false })
  urgent: boolean;

  @Column({ type: 'timestamp', nullable: true })
  dueDate: Date | null;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;
}
