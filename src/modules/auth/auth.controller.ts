import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { CreatePinDto } from './dto/create-pin.dto';
import { VerifyPinDto } from './dto/verify-pin.dto';
import { ResetPinDto } from './dto/reset-pin.dto';
import { PhoneDto, VerifyPhoneOtpDto } from './dto/phone.dto';
import { WorkerLoginDto } from './dto/worker-login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

// Credential endpoints are brute-force targets: much tighter than the global limits.
// (Per IP — main.ts enables `trust proxy` so this is the real client address.)
const STRICT = {
  short: { limit: 5, ttl: 1000 },
  medium: { limit: 10, ttl: 60_000 },
  long: { limit: 40, ttl: 15 * 60_000 },
};
// Authenticated, low-risk session endpoints.
const SESSION = {
  short: { limit: 10, ttl: 1000 },
  medium: { limit: 60, ttl: 60_000 },
  long: { limit: 200, ttl: 15 * 60_000 },
};

@ApiTags('Auth')
@Controller('auth')
@Throttle(STRICT)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.resendOtp(dto.email);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle(SESSION)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  // ── Branch Pastor phone-OTP endpoints ────────────────────────────────────────

  @Public()
  @Post('login-pastor')
  @HttpCode(HttpStatus.OK)
  loginPastor(@Body() dto: PhoneDto) {
    return this.authService.loginWithPhone(dto.phone);
  }

  @Public()
  @Post('verify-pastor-otp')
  @HttpCode(HttpStatus.OK)
  verifyPastorOtp(@Body() dto: VerifyPhoneOtpDto) {
    return this.authService.verifyPhoneOtp(dto);
  }

  @Public()
  @Post('resend-pastor-otp')
  @HttpCode(HttpStatus.OK)
  resendPastorOtp(@Body() dto: PhoneDto) {
    return this.authService.resendPhoneOtp(dto.phone);
  }

  @Public()
  @Post('worker/login')
  @HttpCode(HttpStatus.OK)
  workerLogin(@Body() dto: WorkerLoginDto) {
    return this.authService.loginWithWorkerCode(dto.code);
  }

  @Post('logout')
  @Throttle(SESSION)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@CurrentUser() user: { id: string }) {
    return this.authService.logout(user.id);
  }

  // ── PIN endpoints (pastors only) ─────────────────────────────────────────────

  @Post('pin/create')
  @Throttle(SESSION)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  createPin(@CurrentUser() user: { id: string }, @Body() dto: CreatePinDto) {
    return this.authService.createPin(user.id, dto);
  }

  @Post('pin/verify')
  @Throttle(SESSION)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  verifyPin(@CurrentUser() user: { id: string }, @Body() dto: VerifyPinDto) {
    return this.authService.verifyPin(user.id, dto.pin);
  }

  @Post('pin/reset')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  resetPin(@CurrentUser() user: { id: string }, @Body() dto: ResetPinDto) {
    return this.authService.resetPin(user.id, dto);
  }
}
