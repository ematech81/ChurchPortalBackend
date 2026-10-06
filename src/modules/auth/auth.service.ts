import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { BulkSmsProvider } from '../messaging/providers/bulksms.provider';
import { User } from '../users/user.entity';
import { UserRole } from '@/types';
import { toE164 } from '../../common/utils/phone';
import { BCRYPT_ROUNDS } from '../../common/utils/hash';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { CreatePinDto } from './dto/create-pin.dto';
import { ResetPinDto } from './dto/reset-pin.dto';
import { VerifyPhoneOtpDto } from './dto/phone.dto';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

/**
 * SMS login codes are alphanumeric on purpose. BulkSMS Nigeria sends over the promotional route,
 * which carriers monitor; all-numeric "OTP-looking" messages get flagged and blocked there (they
 * require a separately licensed transactional route). A mix of letters and digits gets through.
 * No 0/O/1/I/L so codes can be read off a phone without mistakes.
 */
const SMS_OTP_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateAlphanumericOtp(): string {
  for (;;) {
    let otp = '';
    for (let i = 0; i < 6; i++) otp += SMS_OTP_CHARS[randomInt(SMS_OTP_CHARS.length)];
    if (/[A-Z]/.test(otp) && /[0-9]/.test(otp)) return otp; // must contain both
  }
}

/** Emails we generate for accounts that have no real mailbox. Never deliver to these. */
const isPlaceholderEmail = (e?: string | null) => !e || e.endsWith('@portal.internal');

const sha256Hex = (v: string) => createHash('sha256').update(v).digest('hex');

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // Compared against when the email doesn't exist, so response time doesn't reveal it.
  private dummyHash: string | null = null;

  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly sms: BulkSmsProvider,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── Email + password ────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);

    if (existing) {
      if (existing.isEmailVerified) {
        throw new ConflictException('An account with this email already exists. Please log in.');
      }
      // Unverified: the latest registrant's password wins. Otherwise someone could
      // pre-register a victim's email with a password only they know.
      const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      await this.usersService.update(existing.id, {
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? existing.phone,
      });
      const emailSent = await this._safeDispatchOtp(existing.id, existing.email);
      return {
        message: 'A verification code has been sent to your email.',
        email: existing.email,
        userId: existing.id,
        emailSent,
      };
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.usersService.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone ?? null,
      passwordHash,
    });

    const emailSent = await this._safeDispatchOtp(user.id, user.email);

    return {
      message: 'A 6-digit verification code has been sent to your email.',
      email: user.email,
      userId: user.id,
      emailSent,
    };
  }

  async resendOtp(email: string) {
    const generic = { message: 'If that account needs verification, a new code has been sent.' };
    const user = await this.usersService.findByEmail(email);
    // Same answer whether or not the account exists (no account enumeration).
    if (!user || user.isEmailVerified) return generic;

    this._assertResendAllowed(user);
    await this._dispatchOtp(user.id, user.email);
    return generic;
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.usersService.findByEmail(dto.email);
    // Only unverified accounts can use this endpoint; verified ones sign in with a password.
    if (!user || user.isEmailVerified) throw new UnauthorizedException('Invalid verification attempt');

    await this._checkOtp(user, dto.code);

    await this.usersService.setEmailVerified(user.id);
    const fresh = await this.usersService.findById(user.id);
    return this.issueTokens(fresh!);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      await bcrypt.compare(dto.password, await this._getDummyHash());
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new ForbiddenException('This account has been deactivated.');

    if (!user.isEmailVerified) {
      await this._safeDispatchOtp(user.id, user.email);
      throw new ForbiddenException({
        message: 'Please verify your email first. A new code has been sent.',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
      });
    }

    return this.issueTokens(user);
  }

  // ── Tokens ──────────────────────────────────────────────────────────────────

  /**
   * The refresh token is self-describing: we verify its signature, read the user
   * from it, and compare its SHA-256 to the stored hash. (bcrypt is unsuitable
   * here — it only hashes the first 72 bytes, and a JWT's first 72 chars are the
   * same for every token of a given user.)
   */
  async refreshTokens(refreshToken: string) {
    let payload: { sub?: string; typ?: string };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get('app.jwtRefreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Access denied');
    }
    if (payload.typ !== 'refresh' || !payload.sub) throw new UnauthorizedException('Access denied');

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive || !user.refreshTokenHash) throw new UnauthorizedException('Access denied');

    if (!safeEqualHex(sha256Hex(refreshToken), user.refreshTokenHash)) {
      throw new UnauthorizedException('Access denied');
    }

    return this.issueTokens(user);
  }

  async logout(userId: string) {
    await this.usersService.clearRefreshToken(userId);
  }

  // Also called by ChurchesService after church creation to re-issue tokens with updated churchId
  async issueTokens(user: User) {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      churchId: user.churchId,
      role: user.role,
    });
    const refreshToken = this.jwtService.sign(
      { sub: user.id, typ: 'refresh', jti: randomUUID() },
      {
        secret: this.config.get('app.jwtRefreshSecret'),
        expiresIn: this.config.get('app.jwtRefreshExpiresIn', '30d'),
      },
    );

    await this.usersService.setRefreshToken(user.id, sha256Hex(refreshToken));

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        churchId: user.churchId,
        hasPin: user.hasPin,
      },
    };
  }

  // ── Branch Pastor phone-OTP login ───────────────────────────────────────────

  async loginWithPhone(phone: string) {
    const user = await this._findBranchPastor(phone, true);
    const { delivery, devCode } = await this._sendPastorOtp(user, phone);
    return {
      message:
        delivery === 'email'
          ? 'A 6-digit verification code has been sent to your email address on file.'
          : 'A 6-digit verification code has been sent to your phone.',
      phone,
      delivery,
      ...(devCode && { devCode }),
    };
  }

  async resendPhoneOtp(phone: string) {
    const user = await this._findBranchPastor(phone, false);
    this._assertResendAllowed(user);
    const { delivery, devCode } = await this._sendPastorOtp(user, phone);
    return { message: 'A new verification code has been sent.', delivery, ...(devCode && { devCode }) };
  }

  async verifyPhoneOtp(dto: VerifyPhoneOtpDto) {
    const user = await this.usersService.findByPhone(dto.phone);
    // One generic answer for unknown phone / wrong role / no church.
    if (!user || user.role !== UserRole.BRANCH_PASTOR || !user.churchId || !user.isActive) {
      throw new UnauthorizedException('Invalid verification attempt.');
    }

    await this._checkOtp(user, dto.code);

    await this.usersService.clearOtp(user.id);
    const fresh = await this.usersService.findById(user.id);
    return this.issueTokens(fresh!);
  }

  // ── PIN management ──────────────────────────────────────────────────────────

  async createPin(userId: string, dto: CreatePinDto) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException();
    this._assertPastorRole(user.role);

    if (user.hasPin) {
      throw new BadRequestException('A PIN is already set. Use "Forgot PIN" to change it.');
    }
    if (dto.pin !== dto.confirmPin) {
      throw new BadRequestException('PINs do not match.');
    }

    const pinHash = await bcrypt.hash(dto.pin, 10);
    await this.usersService.setPin(userId, pinHash);
    return { success: true, hasPin: true };
  }

  async verifyPin(userId: string, pin: string) {
    const user = await this.usersService.findByIdWithPin(userId);
    if (!user) throw new UnauthorizedException();
    this._assertPastorRole(user.role);

    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      const remainingMs = user.pinLockedUntil.getTime() - Date.now();
      const remainingSec = Math.ceil(remainingMs / 1000);
      throw new BadRequestException({
        code: 'PIN_LOCKED',
        message: 'Too many failed attempts.',
        lockedUntil: user.pinLockedUntil.toISOString(),
        remainingSeconds: remainingSec,
      });
    }

    if (!user.pinHash) {
      throw new BadRequestException('No PIN set. Please create a PIN first.');
    }

    const valid = await bcrypt.compare(pin, user.pinHash);
    if (!valid) {
      const attempts = await this.usersService.incrementPinAttempts(userId, user.pinFailedAttempts);
      if (attempts >= 5) {
        throw new BadRequestException({
          code: 'PIN_LOCKED',
          message: 'Too many failed attempts. PIN locked for 15 minutes.',
          remainingSeconds: 15 * 60,
        });
      }
      throw new UnauthorizedException({ code: 'PIN_WRONG', message: 'Incorrect PIN.' });
    }

    await this.usersService.resetPinAttempts(userId);
    return { success: true };
  }

  async resetPin(userId: string, dto: ResetPinDto) {
    const user = await this.usersService.findByIdWithPin(userId);
    if (!user) throw new UnauthorizedException();
    this._assertPastorRole(user.role);

    if (dto.newPin !== dto.confirmPin) {
      throw new BadRequestException('PINs do not match.');
    }

    if (user.role === UserRole.SENIOR_PASTOR) {
      const valid = await bcrypt.compare(dto.credential, user.passwordHash);
      if (!valid) throw new UnauthorizedException('Incorrect password.');
    } else {
      // Branch Pastor: credential is the OTP they requested via resend-pastor-otp
      await this._checkOtp(user, dto.credential);
      await this.usersService.clearOtp(userId);
    }

    const pinHash = await bcrypt.hash(dto.newPin, 10);
    await this.usersService.setPin(userId, pinHash);
    return { success: true, hasPin: true };
  }

  // ── Worker code login ───────────────────────────────────────────────────────

  async loginWithWorkerCode(code: string) {
    const invalid = new UnauthorizedException({
      message: 'Invalid worker code.',
      detail: 'Check the code your pastor gave you and try again.',
      code: 'INVALID_WORKER_CODE',
    });

    const user = await this.usersService.findByLoginCodeHash(UsersService.hashLoginCode(code));
    // A worker code must only ever open a worker account — never a pastor/admin one.
    if (!user || user.role !== UserRole.FOLLOW_UP_WORKER || !user.isActive || !user.churchId) {
      throw invalid;
    }

    if (user.loginCodeLockedUntil && user.loginCodeLockedUntil > new Date()) {
      const remaining = Math.ceil((user.loginCodeLockedUntil.getTime() - Date.now()) / 1000);
      throw new ForbiddenException({
        message: 'Too many failed attempts.',
        detail: `Try again in ${Math.ceil(remaining / 60)} minute(s).`,
        code: 'CODE_LOCKED',
        remainingSeconds: remaining,
      });
    }

    await this.usersService.resetLoginCodeAttempts(user.id);
    const fresh = await this.usersService.findById(user.id);
    return this.issueTokens(fresh!);
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private _assertPastorRole(role: string) {
    if (role !== UserRole.SENIOR_PASTOR && role !== UserRole.BRANCH_PASTOR) {
      throw new ForbiddenException('PIN management is for pastors only.');
    }
  }

  private async _getDummyHash() {
    if (!this.dummyHash) this.dummyHash = await bcrypt.hash('not-a-real-password', BCRYPT_ROUNDS);
    return this.dummyHash;
  }

  private _otpHash(code: string) {
    return createHmac('sha256', this.config.get<string>('app.jwtSecret')!).update(code).digest('hex');
  }

  private _newOtp() {
    return randomInt(100000, 1000000).toString(); // CSPRNG, uniform 6 digits
  }

  private _assertResendAllowed(user: User) {
    // The OTP is issued with a 10-minute lifetime; >9 minutes left means it was sent <60s ago.
    if (user.otpExpiresAt && user.otpExpiresAt.getTime() - Date.now() > OTP_TTL_MS - OTP_RESEND_COOLDOWN_MS) {
      throw new BadRequestException('Please wait 60 seconds before requesting a new code.');
    }
  }

  /** Validates an OTP, counting wrong guesses and destroying the code at the limit. */
  private async _checkOtp(user: User, code: string) {
    if (!user.otpCode || !user.otpExpiresAt) {
      throw new BadRequestException('No pending verification. Please request a new code.');
    }
    if (Date.now() > user.otpExpiresAt.getTime()) {
      throw new BadRequestException('Verification code has expired. Please request a new one.');
    }
    if (!safeEqualHex(this._otpHash(code.trim().toUpperCase()), user.otpCode)) {
      const attempts = await this.usersService.incrementOtpAttempts(user.id);
      if (attempts >= MAX_OTP_ATTEMPTS) {
        await this.usersService.clearOtp(user.id);
        throw new BadRequestException({
          code: 'OTP_LOCKED',
          message: 'Too many incorrect attempts. Please request a new code.',
        });
      }
      throw new UnauthorizedException('Invalid verification code. Please try again.');
    }
  }

  private async _findBranchPastor(phone: string, detailed: boolean): Promise<User> {
    const user = await this.usersService.findByPhone(phone);
    if (!user) {
      throw new NotFoundException({
        message: 'Access Denied!',
        detail:
          'Either you entered an incorrect phone number or you have not yet been assigned a Branch Pastor role. Kindly contact your Senior Pastor for assistance.',
        code: 'PHONE_NOT_FOUND',
      });
    }
    if (user.role !== UserRole.BRANCH_PASTOR) {
      throw new ForbiddenException({
        message: 'Access Denied!',
        detail: detailed
          ? 'This login is for Branch Pastors only. Please use the Admin login with your email address.'
          : 'This login is for Branch Pastors only.',
        code: 'WRONG_LOGIN_TYPE',
      });
    }
    if (!user.churchId) {
      throw new ForbiddenException({
        message: 'Access Denied!',
        detail:
          'Your account has not yet been assigned to a branch. Kindly contact your Senior Pastor for assistance.',
        code: 'NO_BRANCH_ASSIGNED',
      });
    }
    if (!user.isActive) throw new ForbiddenException('This account has been deactivated.');
    return user;
  }

  /**
   * Delivers a pastor login code: SMS (BulkSMS Nigeria) if configured, else the email on
   * file, else — local development only — returned in the response.
   * In production with no channel configured we refuse rather than pretend.
   * SMS (and dev) codes are alphanumeric; email codes stay numeric.
   */
  private async _sendPastorOtp(
    user: User,
    phone: string,
  ): Promise<{ delivery: 'sms' | 'email' | 'dev'; devCode?: string }> {
    const smsReady = this.sms.isConfigured;
    const emailReady = !isPlaceholderEmail(user.email) && !!this.config.get('app.brevoApiKey');
    const devReady = !!this.config.get<boolean>('app.allowDevOtp');

    if (!smsReady && !emailReady && !devReady) {
      this.logger.error('Pastor OTP requested but neither SMS (BULKSMS_*) nor email (BREVO_API_KEY) is configured.');
      throw new ServiceUnavailableException('Code delivery is not available. Please contact support.');
    }

    const code = smsReady || (!emailReady && devReady) ? generateAlphanumericOtp() : this._newOtp();
    await this.usersService.setOtp(user.id, this._otpHash(code), new Date(Date.now() + OTP_TTL_MS));

    try {
      if (smsReady) {
        await this.sms.sendSms(
          toE164(phone),
          this.config.get<string>('app.smsOtpTemplate')!.replace('{code}', code),
        );
        return { delivery: 'sms' };
      }
      if (emailReady) {
        await this.mailService.sendOtp(user.email, code);
        return { delivery: 'email' };
      }
      this.logger.warn(`[DEV] Branch Pastor OTP for ${phone}: ${code}`);
      return { delivery: 'dev', devCode: code };
    } catch (err: any) {
      await this.usersService.clearOtp(user.id);
      this.logger.error(`Pastor OTP delivery failed for user ${user.id}: ${err?.message ?? err}`);
      throw new ServiceUnavailableException('We could not send your code right now. Please try again shortly.');
    }
  }

  private async _dispatchOtp(userId: string, email: string) {
    const code = this._newOtp();
    await this.usersService.setOtp(userId, this._otpHash(code), new Date(Date.now() + OTP_TTL_MS));
    await this.mailService.sendOtp(email, code);
  }

  /** Like _dispatchOtp but never throws; returns whether the email went out. */
  private async _safeDispatchOtp(userId: string, email: string): Promise<boolean> {
    try {
      await this._dispatchOtp(userId, email);
      return true;
    } catch (err: any) {
      this.logger.error(`OTP email failed for ${email}: ${err?.message ?? err}`);
      return false;
    }
  }
}
