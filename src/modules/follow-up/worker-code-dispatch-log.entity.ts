import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('worker_code_dispatch_log')
export class WorkerCodeDispatchLog extends BaseEntity {
  @Column({ type: 'uuid' })
  workerId: string;

  @Column()
  workerName: string;

  @Column({ type: 'varchar', nullable: true })
  workerPhone: string | null;

  // Plaintext code — auto-nulled after expiresAt by a cleanup job (or manually)
  @Column({ type: 'varchar', nullable: true })
  code: string | null;

  @Column({ type: 'uuid', nullable: true })
  assignedBy: string | null;

  // 'pending_manual' | 'whatsapp' | 'sms' | 'call'
  @Column({ type: 'varchar', default: 'pending_manual' })
  channel: string;

  @Column({ type: 'uuid', nullable: true })
  churchId: string | null;

  // 30 days from creation — after this date, code is nulled in the view
  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;
}
