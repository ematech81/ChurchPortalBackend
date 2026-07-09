import { Entity, Column } from 'typeorm';
import { TenantEntity } from '../../common/entities/base.entity';

export enum TaskType {
  SEND_MESSAGE = 'send_message',
  NOTIFY_WORKER = 'notify_worker',
  WORKER_ACTION = 'worker_action',
  CHECK_STATUS = 'check_status',
  ESCALATE = 'escalate',
}

export enum TaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  DONE = 'done',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

@Entity('follow_up_tasks')
export class FollowUpTask extends TenantEntity {
  @Column({ type: 'uuid' })
  journeyId: string;

  @Column({ type: 'enum', enum: TaskType })
  type: TaskType;

  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.PENDING })
  status: TaskStatus;

  @Column()
  triggerAt: Date;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, unknown>;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  error: string | null;
}
