import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ServiceEventsService, CreateServiceEventDto } from './service-events.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChurchId } from '../../common/decorators/church-id.decorator';

@ApiTags('Service Events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('service-events')
export class ServiceEventsController {
  constructor(private readonly service: ServiceEventsService) {}

  @Get()
  list(@ChurchId() churchId: string) {
    return this.service.findByChurch(churchId);
  }

  @Post()
  create(
    @ChurchId() churchId: string,
    @Body() body: { services: CreateServiceEventDto[] },
  ) {
    return this.service.bulkCreate(churchId, body.services ?? []);
  }
}
