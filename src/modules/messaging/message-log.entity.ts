import { Entity, Column } from 'typeorm';
import { TenantEntity } from '../../common/entities/base.entity';

export enum MessageChannel {
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
  EMAIL = 'email',
  PUSH = 'push',
}

export enum MessageStatus {
  QUEUED = 'queued',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

@Entity('message_logs')
export class MessageLog extends TenantEntity {
  @Column({ type: 'uuid', nullable: true })
  memberId: string | null;

  @Column()
  recipientPhone: string;

  @Column({ type: 'enum', enum: MessageChannel })
  channel: MessageChannel;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'enum', enum: MessageStatus, default: MessageStatus.QUEUED })
  status: MessageStatus;

  @Column({ type: 'varchar', nullable: true })
  providerMessageId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  error: string | null;
}
