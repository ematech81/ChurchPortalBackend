import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { UserRole } from '@/types';

@Entity('users')
export class User extends BaseEntity {
  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Index({ unique: true })
  @Column()
  email: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column()
  passwordHash: string;

  @Column({ type: 'varchar', nullable: true })
  refreshTokenHash: string | null;

  @Column({ type: 'uuid', nullable: true })
  churchId: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.MEMBER })
  role: UserRole;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ type: 'varchar', nullable: true })
  otpCode: string | null;

  @Column({ type: 'timestamp', nullable: true })
  otpExpiresAt: Date | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'varchar', nullable: true })
  avatarUrl: string | null;

  @Column({ default: false })
  hasPin: boolean;

  @Column({ type: 'varchar', nullable: true, select: false })
  pinHash: string | null;

  @Column({ default: 0 })
  pinFailedAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  pinLockedUntil: Date | null;

  // ── Worker login code (FOLLOW_UP_WORKER role only) ─────────────────────────
  // Stored as SHA-256 hex of the lowercased code — allows O(1) DB lookup.
  // Plaintext is returned ONLY in the create/regenerate response, never stored.
  @Index({ unique: true, sparse: true })
  @Column({ type: 'varchar', nullable: true, select: false })
  loginCodeHash: string | null;

  @Column({ type: 'timestamp', nullable: true })
  loginCodeUpdatedAt: Date | null;

  @Column({ default: 0 })
  loginCodeFailedAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  loginCodeLockedUntil: Date | null;
}
