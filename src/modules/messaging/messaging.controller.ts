import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MessagingService } from './messaging.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChurchId } from '../../common/decorators/church-id.decorator';

@ApiTags('Messaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('messaging')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Get('logs')
  getLogs(@ChurchId() churchId: string) {
    return this.messagingService.getLogs(churchId);
  }

  @Post('whatsapp')
  sendWhatsApp(
    @ChurchId() churchId: string,
    @Body() body: { to: string; message: string; memberId?: string },
  ) {
    return this.messagingService.sendWhatsApp(
      churchId,
      body.to,
      body.message,
      body.memberId,
    );
  }

  @Post('sms')
  sendSms(
    @ChurchId() churchId: string,
    @Body() body: { to: string; message: string; memberId?: string },
  ) {
    return this.messagingService.sendSms(churchId, body.to, body.message, body.memberId);
  }
}
