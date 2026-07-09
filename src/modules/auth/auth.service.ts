import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CreatePinDto } from './dto/create-pin.dto';
import { ResetPinDto } from './dto/reset-pin.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { User } from '../users/user.entity';
import { UserRole } from '@/types';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({ ...dto, passwordHash });

    await this._dispatchOtp(user.id, user.email);

    return {
      message: 'A 6-digit verification code has been sent to your email.',
      email: user.email,
      userId: user.id,
    };
  }

  async resendOtp(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new NotFoundException('No account found with that email');
    if (user.isEmailVerified) throw new BadRequestException('Email is already verified');

    // Rate-limit: 1 resend per 60 seconds
    if (user.otpExpiresAt && user.otpExpiresAt.getTime() - Date.now() > 9 * 60 * 1000) {
      throw new BadRequestException('Please wait 60 seconds before requesting a new code');
    }

    await this._dispatchOtp(user.id, email);
    return { message: 'A new verification code has been sent to your email.' };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid verification attempt');

    if (!user.otpCode || !user.otpExpiresAt) {
      throw new BadRequestException('No pending verification. Please request a new code.');
    }

    if (Date.now() > user.otpExpiresAt.getTime()) {
      throw new BadRequestException('Verification code has expired. Please request a new one.');
    }

    if (user.otpCode !== dto.code) {
      throw new UnauthorizedException('Invalid verification code. Please try again.');
    }

    await this.usersService.setEmailVerified(user.id);
    const fresh = await this.usersService.findById(user.id);
    return this.issueTokens(fresh!);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (!user.isEmailVerified) {
      // Auto-resend OTP so they can verify immediately
      await this._dispatchOtp(user.id, user.email);
      throw new ForbiddenException({
        message: 'Please verify your email first. A new code has been sent.',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
      });
    }

    return this.issueTokens(user);
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.refreshTokenHash)
      throw new UnauthorizedException('Access denied');

    const valid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!valid) throw new UnauthorizedException('Access denied');

    return this.issueTokens(user);
  }

  async logout(userId: string) {
    await this.usersService.clearRefreshToken(userId);
  }

  // Called by ChurchesService after church creation to re-issue tokens with updated churchId
  async issueTokens(user: User) {
    const payload = { sub: user.id, churchId: user.churchId, role: user.role };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get('app.jwtRefreshSecret'),
      expiresIn: this.config.get('app.jwtRefreshExpiresIn', '30d'),
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
    await this.usersService.setRefreshToken(user.id, refreshTokenHash);

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

  // ── Branch Pastor phone-OTP login ────────────────────────────────────────────

  async loginWithPhone(phone: string) {
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
        detail:
          'This login is for Branch Pastors only. Please use the Admin login with your email address.',
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
    const devCode = await this._dispatchPhoneOtp(user.id, phone);
    return {
      message: 'A 6-digit verification code has been sent to your phone.',
      phone,
      // devCode is only included outside production — never logged or returned in prod
      ...(process.env.NODE_ENV !== 'production' && { devCode }),
    };
  }

  async resendPhoneOtp(phone: string) {
    const user = await this.usersService.findByPhone(phone);
    if (!user) throw new NotFoundException('No account found with this phone number.');
    // Rate-limit: same 60-second window as email OTP
    if (user.otpExpiresAt && user.otpExpiresAt.getTime() - Date.now() > 9 * 60 * 1000) {
      throw new BadRequestException('Please wait 60 seconds before requesting a new code.');
    }
    const devCode = await this._dispatchPhoneOtp(user.id, phone);
    return {
      message: 'A new verification code has been sent.',
      ...(process.env.NODE_ENV !== 'production' && { devCode }),
    };
  }

  async verifyPhoneOtp(dto: { phone: string; code: string }) {
    const user = await this.usersService.findByPhone(dto.phone);
    if (!user) throw new UnauthorizedException('Invalid verification attempt.');

    if (!user.otpCode || !user.otpExpiresAt) {
      throw new BadRequestException('No pending verification. Please request a new code.');
    }
    if (Date.now() > user.otpExpiresAt.getTime()) {
      throw new BadRequestException('Verification code has expired. Please request a new one.');
    }
    if (user.otpCode !== dto.code) {
      throw new UnauthorizedException('Invalid verification code. Please try again.');
    }

    await this.usersService.clearOtp(user.id);
    const fresh = await this.usersService.findById(user.id);
    return this.issueTokens(fresh!);
  }

  // ── PIN management ──────────────────────────────────────────────────────────

  async createPin(userId: string, dto: CreatePinDto) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException();
    this._assertPastorRole(user.role);

    if (dto.pin !== dto.confirmPin) {
      throw new BadRequestException('PINs do not match.');
    }
    if (!/^\d{4}$/.test(dto.pin)) {
      throw new BadRequestException('PIN must be exactly 4 digits.');
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
    if (!/^\d{4}$/.test(dto.newPin)) {
      throw new BadRequestException('PIN must be exactly 4 digits.');
    }

    if (user.role === 'senior_pastor') {
      const valid = await bcrypt.compare(dto.credential, user.passwordHash);
      if (!valid) throw new UnauthorizedException('Incorrect password.');
    } else {
      // Branch Pastor: credential is OTP code
      if (!user.otpCode || !user.otpExpiresAt) {
        throw new BadRequestException('No pending OTP. Please request a new code.');
      }
      if (Date.now() > user.otpExpiresAt.getTime()) {
        throw new BadRequestException('OTP has expired. Please request a new one.');
      }
      if (user.otpCode !== dto.credential) {
        throw new UnauthorizedException('Invalid OTP code.');
      }
      await this.usersService.clearOtp(userId);
    }

    const pinHash = await bcrypt.hash(dto.newPin, 10);
    await this.usersService.setPin(userId, pinHash);
    return { success: true, hasPin: true };
  }

  // ── Worker code login ────────────────────────────────────────────────────────

  async loginWithWorkerCode(code: string) {
    const hash = UsersService.hashLoginCode(code);
    const user = await this.usersService.findByLoginCodeHash(hash);

    if (!user) {
      throw new UnauthorizedException({
        message: 'Invalid worker code.',
        detail: 'Check the code your pastor gave you and try again.',
        code: 'INVALID_WORKER_CODE',
      });
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

  private _assertPastorRole(role: string) {
    if (role !== 'senior_pastor' && role !== 'branch_pastor') {
      throw new ForbiddenException('PIN management is for pastors only.');
    }
  }

  private async _dispatchPhoneOtp(userId: string, phone: string): Promise<string> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.usersService.setOtp(userId, code, expiresAt);
    // TODO: replace with Termii SMS in production
    console.log(`[DEV] Branch Pastor OTP for ${phone}: ${code}`);
    return code;
  }

  private async _dispatchOtp(userId: string, email: string) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.usersService.setOtp(userId, code, expiresAt);
    await this.mailService.sendOtp(email, code);
  }
}
