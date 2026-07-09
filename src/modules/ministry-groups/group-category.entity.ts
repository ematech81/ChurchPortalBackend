import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('group_categories')
export class GroupCategory extends BaseEntity {
  // null = global seed; set to a churchId for church-specific custom categories
  @Column({ type: 'uuid', nullable: true })
  churchId: string | null;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  // Frontend icon map key — e.g. 'home', 'business', 'heart', 'hammer'
  @Column({ type: 'varchar', nullable: true })
  iconKey: string | null;

  @Column({ type: 'varchar', default: 'Leader' })
  defaultLeaderTitle: string;

  @Column({ type: 'varchar', default: 'Member' })
  defaultMemberTitle: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;
}
