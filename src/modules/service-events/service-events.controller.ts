import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ServiceEventsService } from './service-events.service';
import { CreateServiceEventsDto } from './dto/service-event.dto';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../constants/role-groups';

@ApiTags('Service Events')
@ApiBearerAuth()
@Controller('service-events')
export class ServiceEventsController {
  constructor(private readonly service: ServiceEventsService) {}

  // Any signed-in member of the church may see the service schedule.
  @Get()
  list(@ChurchId() churchId: string) {
    return this.service.findByChurch(churchId);
  }

  @Post()
  @Roles(...ADMIN_ROLES)
  create(@ChurchId() churchId: string, @Body() dto: CreateServiceEventsDto) {
    return this.service.bulkCreate(churchId, dto.services);
  }
}
