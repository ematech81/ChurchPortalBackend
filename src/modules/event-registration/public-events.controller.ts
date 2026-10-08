import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PublicEventsService } from './public-events.service';
import { PublicRegisterDto } from './dto/event-form.dto';
import { Public } from '../../common/decorators/public.decorator';

// Anonymous endpoints. Limits are per IP and deliberately generous: many people in Nigeria share one
// mobile-carrier IP, and a church announcing a crusade gets a burst of sign-ups at the same moment.
const READ_LIMITS = {
  short: { limit: 20, ttl: 1000 },
  medium: { limit: 300, ttl: 60_000 },
  long: { limit: 3000, ttl: 60 * 60_000 },
};
const REGISTER_LIMITS = {
  short: { limit: 5, ttl: 1000 },
  medium: { limit: 40, ttl: 60_000 },
  long: { limit: 600, ttl: 60 * 60_000 },
};

@ApiTags('Public events')
@Public()
@Controller('public/events')
export class PublicEventsController {
  constructor(private readonly service: PublicEventsService) {}

  @Get(':slug')
  @Throttle(READ_LIMITS)
  getForm(@Param('slug') slug: string) {
    return this.service.getForm(slug);
  }

  @Post(':slug/register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle(REGISTER_LIMITS)
  register(@Param('slug') slug: string, @Body() dto: PublicRegisterDto) {
    return this.service.register(slug, dto);
  }
}
