import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MessagingService } from './messaging.service';
import { SendMessageDto, SendBulkDto } from './dto/send-message.dto';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../constants/role-groups';

// Every message spends the church's SMS credit, so: admins only, and tightly rate limited.
const SEND_LIMITS = {
  short: { limit: 3, ttl: 1000 },
  medium: { limit: 30, ttl: 60_000 },
  long: { limit: 300, ttl: 60 * 60_000 },
};

@ApiTags('Messaging')
@ApiBearerAuth()
@Roles(...ADMIN_ROLES)
@Controller('messaging')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Get('logs')
  getLogs(@ChurchId() churchId: string) {
    return this.messagingService.getLogs(churchId);
  }

  /** Sends one SMS to many members (max 100 per call), skipping anyone who opted out. */
  @Post('send-bulk')
  @Throttle({ short: { limit: 1, ttl: 1000 }, medium: { limit: 5, ttl: 60_000 }, long: { limit: 30, ttl: 60 * 60_000 } })
  sendBulk(@ChurchId() churchId: string, @Body() dto: SendBulkDto) {
    return this.messagingService.sendBulk(churchId, dto.memberIds, dto.body);
  }

  @Post('sms')
  @Throttle(SEND_LIMITS)
  sendSms(@ChurchId() churchId: string, @Body() dto: SendMessageDto) {
    return this.messagingService.sendSms(churchId, dto.to, dto.message, dto.memberId);
  }
}
