import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MinistryGroupsService } from './ministry-groups.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GroupStatus } from './ministry-group.entity';

@ApiTags('Ministry Groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class MinistryGroupsController {
  constructor(private readonly svc: MinistryGroupsService) {}

  // ── Categories ─────────────────────────────────────────────────────────────

  @Get('group-categories')
  listCategories(@ChurchId() churchId: string) {
    return this.svc.listCategories(churchId);
  }

  @Post('group-categories')
  createCategory(@ChurchId() churchId: string, @Body() body: any) {
    return this.svc.createCategory(churchId, body);
  }

  // ── Groups ─────────────────────────────────────────────────────────────────

  @Get('ministry-groups')
  listGrouped(
    @ChurchId() churchId: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: string,
    @Query('flat') flat?: string,
  ) {
    if (flat === 'true') {
      return this.svc.listGroups(churchId, search, categoryId, status);
    }
    return this.svc.listGroupedByCategory(churchId, search, categoryId, status);
  }

  @Post('ministry-groups')
  createGroup(
    @ChurchId() churchId: string,
    @Body() body: any,
    @Query('draft') draft?: string,
  ) {
    return this.svc.createGroup(churchId, { ...body, isDraft: draft === 'true' });
  }

  @Get('ministry-groups/:id')
  getGroup(@Param('id') id: string, @ChurchId() churchId: string) {
    return this.svc.getGroupById(id, churchId);
  }

  @Patch('ministry-groups/:id')
  updateGroup(
    @Param('id') id: string,
    @ChurchId() churchId: string,
    @Body() body: any,
  ) {
    return this.svc.updateGroup(id, churchId, body);
  }

  @Delete('ministry-groups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGroup(@Param('id') id: string, @ChurchId() churchId: string) {
    return this.svc.deleteGroup(id, churchId);
  }

  // ── Memberships ────────────────────────────────────────────────────────────

  @Post('ministry-groups/:id/members')
  addMember(
    @Param('id') groupId: string,
    @ChurchId() churchId: string,
    @Body() body: { memberId: string; roleTitle?: string },
  ) {
    return this.svc.addMember(groupId, churchId, body.memberId, body.roleTitle);
  }

  @Delete('ministry-groups/:id/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('id') groupId: string,
    @Param('memberId') memberId: string,
    @ChurchId() churchId: string,
  ) {
    return this.svc.removeMember(groupId, memberId, churchId);
  }

  // ── Attendance ─────────────────────────────────────────────────────────────

  @Post('ministry-groups/:id/attendance')
  recordAttendance(
    @Param('id') groupId: string,
    @ChurchId() churchId: string,
    @Body() body: { date: string; presentCount: number; totalCount: number },
  ) {
    return this.svc.recordAttendance(groupId, churchId, body.date, body.presentCount, body.totalCount);
  }
}
