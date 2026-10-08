import { Entity, Column, Index } from 'typeorm';
import { TenantEntity } from '../../common/entities/base.entity';

@Entity('event_registrations')
@Index(['eventId', 'createdAt'])
// One registration per phone when the event asks for it. dedupeKey is NULL when duplicates are
// allowed; Postgres treats NULLs as distinct, so the unique index only applies when it is set.
// That makes the rule race-proof: two simultaneous submissions cannot both succeed.
@Index(['eventId', 'dedupeKey'], { unique: true })
@Index(['eventId', 'ticketCode'], { unique: true })
export class EventRegistration extends TenantEntity {
  @Column({ type: 'uuid' })
  eventId: string;

  @Column()
  fullName: string;

  /** Normalised +234... */
  @Column()
  phone: string;

  @Column({ type: 'varchar', nullable: true })
  dedupeKey: string | null;

  /** Short code the registrant keeps; used for check-in later. */
  @Column()
  ticketCode: string;

  /** { [fieldId]: value } */
  @Column({ type: 'jsonb', default: {} })
  answers: Record<string, unknown>;
}
