import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../constants/role-groups';
import { ChurchId } from '../../common/decorators/church-id.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Roles(...ADMIN_ROLES)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  getStats(@ChurchId() churchId: string, @Req() req: any) {
    return this.dashboardService.getStats(churchId, req.user?.role ?? '');
  }
}
