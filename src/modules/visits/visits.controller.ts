import { Controller, Get, Post, Patch, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { VisitsService } from './visits.service';
import { CreateVisitDto, UpdateVisitDto } from './dto/visit.dto';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@/types';
import { ADMIN_ROLES } from '../../constants/role-groups';

// Visits belong to the follow-up worker who owns them (pastors can manage all).
@ApiTags('Visits')
@ApiBearerAuth()
@Roles(...ADMIN_ROLES, UserRole.FOLLOW_UP_WORKER, UserRole.CELL_LEADER)
@Controller('visits')
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Get('mine')
  getMyVisits(@CurrentUser() user: { id: string }, @ChurchId() churchId: string) {
    return this.visitsService.getUpcoming(user.id, churchId);
  }

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @ChurchId() churchId: string,
    @Body() dto: CreateVisitDto,
  ) {
    return this.visitsService.create(churchId, user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @ChurchId() churchId: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: UpdateVisitDto,
  ) {
    const isAdmin = (ADMIN_ROLES as string[]).includes(user.role);
    return this.visitsService.update(id, churchId, dto, isAdmin ? null : user.id);
  }
}
