import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MinistryGroupsService } from './ministry-groups.service';
import {
  CreateCategoryDto, CreateGroupDto, UpdateGroupDto, AddGroupMemberDto, RecordGroupAttendanceDto, AddToWorkforceDto,
} from './dto/ministry-group.dto';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ADMIN_ROLES, STAFF_ROLES } from '../../constants/role-groups';

@ApiTags('Ministry Groups')
@ApiBearerAuth()
@Roles(...ADMIN_ROLES)
@Controller()
export class MinistryGroupsController {
  constructor(private readonly svc: MinistryGroupsService) {}

  // ── Categories ─────────────────────────────────────────────────────────────

  @Get('group-categories')
  @Roles(...STAFF_ROLES)
  listCategories(@ChurchId() churchId: string) {
    return this.svc.listCategories(churchId);
  }

  @Post('group-categories')
  createCategory(@ChurchId() churchId: string, @Body() dto: CreateCategoryDto) {
    return this.svc.createCategory(churchId, dto);
  }

  // ── Groups ─────────────────────────────────────────────────────────────────

  @Get('ministry-groups')
  @Roles(...STAFF_ROLES)
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
    @Body() dto: CreateGroupDto,
    @Query('draft') draft?: string,
  ) {
    return this.svc.createGroup(churchId, { ...dto, isDraft: draft === 'true' });
  }

  @Get('ministry-groups/:id')
  @Roles(...STAFF_ROLES)
  getGroup(@Param('id', ParseUUIDPipe) id: string, @ChurchId() churchId: string) {
    return this.svc.getGroupById(id, churchId);
  }

  @Patch('ministry-groups/:id')
  updateGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @ChurchId() churchId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.svc.updateGroup(id, churchId, dto);
  }

  @Delete('ministry-groups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGroup(@Param('id', ParseUUIDPipe) id: string, @ChurchId() churchId: string) {
    return this.svc.deleteGroup(id, churchId);
  }

  // ── Memberships ────────────────────────────────────────────────────────────

  @Post('ministry-groups/:id/members')
  addMember(
    @Param('id', ParseUUIDPipe) groupId: string,
    @ChurchId() churchId: string,
    @Body() dto: AddGroupMemberDto,
  ) {
    return this.svc.addMember(groupId, churchId, dto.memberId, dto.roleTitle);
  }

  /**
   * "Add to workforce": puts a member into a department/group AND makes them a worker
   * (status → worker) if they were an ordinary member. Pastors and ministers keep their status.
   */
  @Post('ministry-groups/:id/workforce')
  addToWorkforce(
    @Param('id', ParseUUIDPipe) groupId: string,
    @ChurchId() churchId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: AddToWorkforceDto,
  ) {
    return this.svc.addToWorkforce(groupId, churchId, dto.memberId, dto.roleTitle, user.id);
  }

  @Delete('ministry-groups/:id/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @ChurchId() churchId: string,
  ) {
    return this.svc.removeMember(groupId, memberId, churchId);
  }

  // ── Attendance ─────────────────────────────────────────────────────────────

  @Post('ministry-groups/:id/attendance')
  recordAttendance(
    @Param('id', ParseUUIDPipe) groupId: string,
    @ChurchId() churchId: string,
    @Body() dto: RecordGroupAttendanceDto,
  ) {
    return this.svc.recordAttendance(groupId, churchId, dto.date, dto.presentCount, dto.totalCount);
  }
}
