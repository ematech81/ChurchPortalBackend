import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { CreatePinDto } from './dto/create-pin.dto';
import { VerifyPinDto } from './dto/verify-pin.dto';
import { ResetPinDto } from './dto/reset-pin.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.resendOtp(dto.email);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refreshTokens(dto.userId, dto.refreshToken);
  }

  // ── Branch Pastor phone-OTP endpoints ────────────────────────────────────────

  @Post('login-pastor')
  @HttpCode(HttpStatus.OK)
  loginPastor(@Body() body: { phone: string }) {
    return this.authService.loginWithPhone(body.phone);
  }

  @Post('verify-pastor-otp')
  @HttpCode(HttpStatus.OK)
  verifyPastorOtp(@Body() body: { phone: string; code: string }) {
    return this.authService.verifyPhoneOtp(body);
  }

  @Post('resend-pastor-otp')
  @HttpCode(HttpStatus.OK)
  resendPastorOtp(@Body() body: { phone: string }) {
    return this.authService.resendPhoneOtp(body.phone);
  }

  @Post('worker/login')
  @HttpCode(HttpStatus.OK)
  workerLogin(@Body() body: { code: string }) {
    return this.authService.loginWithWorkerCode(body.code);
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@CurrentUser() user: { id: string }) {
    return this.authService.logout(user.id);
  }

  // ── PIN endpoints (pastors only) ─────────────────────────────────────────────

  @Post('pin/create')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  createPin(@CurrentUser() user: { id: string }, @Body() dto: CreatePinDto) {
    return this.authService.createPin(user.id, dto);
  }

  @Post('pin/verify')
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
