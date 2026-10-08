import { Entity, Column, Index } from 'typeorm';
import { TenantEntity } from '../../common/entities/base.entity';

/** Audit trail: who exported which data, when. Exports contain personal data, so each one is recorded. */
@Entity('export_logs')
@Index(['churchId', 'createdAt'])
export class ExportLog extends TenantEntity {
  @Column({ type: 'uuid' })
  userId: string;

  /** 'members' | 'event_registrations' */
  @Column({ type: 'varchar' })
  kind: string;

  @Column({ type: 'varchar' })
  format: string;

  @Column({ type: 'int', default: 0 })
  rowCount: number;

  /** The filters/options used (never the exported data itself). */
  @Column({ type: 'jsonb', default: {} })
  details: Record<string, unknown>;
}
