import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { VisitsService } from './visits.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Visits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('visits')
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Get('mine')
  getMyVisits(
    @CurrentUser() user: { id: string },
    @ChurchId() churchId: string,
  ) {
    return this.visitsService.getUpcoming(user.id, churchId);
  }

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @ChurchId() churchId: string,
    @Body() body: any,
  ) {
    return this.visitsService.create(churchId, user.id, body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @ChurchId() churchId: string,
    @Body() body: any,
  ) {
    return this.visitsService.update(id, churchId, body);
  }
}
