import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomInt } from 'crypto';
import { User } from './user.entity';
import { UserRole } from '@/types';
import { phoneDigitVariants, sqlDigits } from '../../common/utils/phone';

// No 0/o/1/l/i — worker codes are read aloud and typed from SMS.
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  /** What a client is allowed to see about a user — never hashes, OTPs or lockout internals. */
  static toPublic(u: User) {
    return {
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phone: u.phone,
      role: u.role,
      churchId: u.churchId,
      avatarUrl: u.avatarUrl,
      hasPin: u.hasPin,
      isEmailVerified: u.isEmailVerified,
      createdAt: u.createdAt,
    };
  }

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  /** Case-insensitive. Returns null for empty input instead of an arbitrary row. */
  findByEmail(email: string) {
    const e = email?.trim().toLowerCase();
    if (!e) return Promise.resolve(null);
    return this.repo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :e', { e })
      .getOne();
  }

  /**
   * Matches any spelling of the same number (0803…, +234 803…, 803…).
   * Returns null for empty/garbage input — never an arbitrary row.
   * Optionally restricted to a set of churches (tenant scoping).
   */
  findByPhone(phone: string | null | undefined, churchIds?: string[]) {
    const variants = phoneDigitVariants(phone);
    if (!variants.length) return Promise.resolve(null);
    const qb = this.repo
      .createQueryBuilder('u')
      .where(`${sqlDigits('u.phone')} IN (:...variants)`, { variants });
    if (churchIds) {
      if (!churchIds.length) return Promise.resolve(null);
      qb.andWhere('u.churchId IN (:...churchIds)', { churchIds });
    }
    return qb.orderBy('u.createdAt', 'ASC').getOne();
  }

  create(data: Partial<User>) {
    return this.repo.save(this.repo.create(data));
  }

  async update(userId: string, data: Partial<User>) {
    await this.repo.update(userId, data as any);
    return this.findById(userId);
  }

  // ── OTP (stored as an HMAC, never plaintext) ──────────────────────────────

  async setOtp(userId: string, otpHash: string, expiresAt: Date) {
    await this.repo.update(userId, { otpCode: otpHash, otpExpiresAt: expiresAt, otpAttempts: 0 });
  }

  async clearOtp(userId: string) {
    await this.repo.update(userId, {
      otpCode: null as any,
      otpExpiresAt: null as any,
      otpAttempts: 0,
    });
  }

  /** Atomic increment; returns the new count. */
  async incrementOtpAttempts(userId: string): Promise<number> {
    await this.repo.increment({ id: userId }, 'otpAttempts', 1);
    const u = await this.repo.findOne({ where: { id: userId }, select: ['id', 'otpAttempts'] });
    return u?.otpAttempts ?? 0;
  }

  async setEmailVerified(userId: string) {
    await this.repo.update(userId, {
      isEmailVerified: true,
      otpCode: null,
      otpExpiresAt: null,
      otpAttempts: 0,
    });
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  async setRefreshToken(userId: string, hash: string) {
    await this.repo.update(userId, { refreshTokenHash: hash });
  }

  async clearRefreshToken(userId: string) {
    await this.repo.update(userId, { refreshTokenHash: null });
  }

  async setChurchAndRole(userId: string, churchId: string, role: UserRole) {
    await this.repo.update(userId, { churchId, role });
  }

  // ── PIN ───────────────────────────────────────────────────────────────────

  findByIdWithPin(id: string) {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.pinHash')
      .where('u.id = :id', { id })
      .getOne();
  }

  async setPin(userId: string, pinHash: string) {
    await this.repo.update(userId, {
      pinHash,
      hasPin: true,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
    } as any);
  }

  async incrementPinAttempts(userId: string, current: number) {
    const next = current + 1;
    const update: any = { pinFailedAttempts: next };
    if (next >= 5) {
      update.pinLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
    await this.repo.update(userId, update);
    return next;
  }

  async resetPinAttempts(userId: string) {
    await this.repo.update(userId, {
      pinFailedAttempts: 0,
      pinLockedUntil: null,
    } as any);
  }

  // ── Worker login code ─────────────────────────────────────────────────────

  static hashLoginCode(code: string): string {
    return createHash('sha256').update(code.trim().toLowerCase()).digest('hex');
  }

  /** `firstname-xxxxxxxx` — 8 random chars from a 31-symbol alphabet (~39 bits), CSPRNG. */
  static generateLoginCode(firstName: string): string {
    const prefix =
      (firstName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'worker';
    let rand = '';
    for (let i = 0; i < 8; i++) rand += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    return `${prefix}-${rand}`;
  }

  findByLoginCodeHash(hash: string) {
    // loginCodeHash has a unique index. Callers MUST still verify the role.
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.loginCodeHash')
      .where('u.loginCodeHash = :hash', { hash })
      .getOne();
  }

  async setLoginCode(userId: string, codeHash: string) {
    await this.repo.update(userId, {
      loginCodeHash: codeHash,
      loginCodeUpdatedAt: new Date(),
      loginCodeFailedAttempts: 0,
      loginCodeLockedUntil: null,
    } as any);
  }

  async incrementLoginCodeAttempts(userId: string, current: number) {
    const next = current + 1;
    const update: any = { loginCodeFailedAttempts: next };
    if (next >= 5) {
      update.loginCodeLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
    await this.repo.update(userId, update);
    return next;
  }

  async resetLoginCodeAttempts(userId: string) {
    await this.repo.update(userId, {
      loginCodeFailedAttempts: 0,
      loginCodeLockedUntil: null,
    } as any);
  }
}
