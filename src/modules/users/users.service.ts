import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { User } from './user.entity';
import { UserRole } from '@/types';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  findByEmail(email: string) {
    return this.repo.findOne({ where: { email } });
  }

  findByPhone(phone: string) {
    return this.repo.findOne({ where: { phone } });
  }

  async clearOtp(userId: string) {
    await this.repo.update(userId, { otpCode: null as any, otpExpiresAt: null as any });
  }

  create(data: Partial<User>) {
    return this.repo.save(this.repo.create(data));
  }

  async setRefreshToken(userId: string, hash: string) {
    await this.repo.update(userId, { refreshTokenHash: hash });
  }

  async clearRefreshToken(userId: string) {
    await this.repo.update(userId, { refreshTokenHash: null });
  }

  async update(userId: string, data: Partial<User>) {
    await this.repo.update(userId, data);
    return this.findById(userId);
  }

  async setOtp(userId: string, code: string, expiresAt: Date) {
    await this.repo.update(userId, { otpCode: code, otpExpiresAt: expiresAt });
  }

  async setEmailVerified(userId: string) {
    await this.repo.update(userId, { isEmailVerified: true, otpCode: null, otpExpiresAt: null });
  }

  async setChurchAndRole(userId: string, churchId: string, role: UserRole) {
    await this.repo.update(userId, { churchId, role });
  }

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

  // ── Worker login code ──────────────────────────────────────────────────────

  static hashLoginCode(code: string): string {
    return createHash('sha256').update(code.toLowerCase()).digest('hex');
  }

  static generateLoginCode(firstName: string): string {
    const rand = randomBytes(4).toString('base64url').slice(0, 6).toLowerCase();
    return `${firstName.toLowerCase()}-${rand}`;
  }

  findByLoginCodeHash(hash: string) {
    // loginCodeHash has a unique index — no role filter needed.
    // The role restriction was previously causing login failures for users
    // whose loginCodeHash was set but whose role wasn't updated to FOLLOW_UP_WORKER.
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
