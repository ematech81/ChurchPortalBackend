import { Entity, Column, Index } from 'typeorm';
import { TenantEntity } from '../../common/entities/base.entity';

export const FIELD_TYPES = [
  'short_text', 'long_text', 'phone', 'email', 'number', 'dropdown', 'radio', 'checkbox', 'date', 'yes_no',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const CHOICE_TYPES: FieldType[] = ['dropdown', 'radio', 'checkbox'];

/** One question on a registration form. The id is stable: answers are stored against it. */
export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  options?: string[];
  helpText?: string;
}

/** An event that people register for through a public, shareable link. */
@Entity('event_forms')
export class EventForm extends TenantEntity {
  /** Public URL part: /e/<slug> */
  @Index({ unique: true })
  @Column()
  slug: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'timestamp', nullable: true })
  startsAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  venue: string | null;

  @Column({ type: 'timestamp', nullable: true })
  registrationClosesAt: Date | null;

  /** null = unlimited */
  @Column({ type: 'int', nullable: true })
  capacity: number | null;

  /** Manual open/close switch, independent of the deadline. */
  @Column({ default: true })
  isOpen: boolean;

  /** true = one registration per phone number */
  @Column({ default: true })
  uniquePhone: boolean;

  @Column({ type: 'text', nullable: true })
  confirmationMessage: string | null;

  @Column({ type: 'jsonb', default: [] })
  fields: FormField[];

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;
}
