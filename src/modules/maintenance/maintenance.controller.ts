import {
  Controller, Post, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { MaintenanceService } from './maintenance.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@/types';

@ApiTags('Maintenance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SENIOR_PASTOR)
@Controller('admin/maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  /**
   * Hard-deletes ALL member records for the calling Senior Pastor's church.
   *
   * Requires:
   *  - ENABLE_MAINTENANCE_ENDPOINTS=true in environment
   *  - Senior Pastor role
   *  - Account password re-confirmed in the request body
   *
   * Use ?dryRun=true (default) to preview what would be deleted.
   * Use ?dryRun=false to execute the wipe.
   *
   * DO NOT enable in production. Remove or disable after the one-time cleanup.
   */
  @Post('wipe-members')
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ name: 'dryRun', required: false })
  wipeMembers(
    @CurrentUser() caller: { id: string },
    @Body() body: { password: string },
    @Query('dryRun') dryRun?: string,
  ) {
    return this.maintenanceService.wipeMembersCheck(
      caller.id,
      body.password,
      dryRun !== 'false',   // default is dry-run
    );
  }
}
