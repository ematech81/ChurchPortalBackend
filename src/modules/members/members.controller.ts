import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, ParseUUIDPipe, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile, Req, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { MembersService } from './members.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@/types';
import { FollowUpFlagDto } from './dto/follow-up-flag.dto';
import { YouthBulkDto } from './dto/youth-bulk.dto';
import { MemberExportDto, MemberExportCountDto } from './dto/member-export.dto';
import { MembersExportService } from './members-export.service';
import { ADMIN_ROLES } from '../../constants/role-groups';
import { imageUploadOptions, saveImage } from '../../common/utils/image-upload';
import { MEMBER_WRITE_ROLES, STAFF_ROLES, SENIOR_ROLES } from '../../constants/role-groups';

@ApiTags('Members')
@ApiBearerAuth()
@Controller('members')
export class MembersController {
  constructor(
    private readonly membersService: MembersService,
    private readonly exportService: MembersExportService,
  ) {}

  // ── Export (pastors only; every export is written to the audit log) ──────────

  /** How many people would this export contain? */
  @Post('export/count')
  @Roles(...ADMIN_ROLES)
  exportCount(@ChurchId() churchId: string, @CurrentUser() user: { role: string }, @Body() dto: MemberExportCountDto) {
    return this.exportService.count(churchId, user.role, dto);
  }

  @Post('export')
  @Roles(...ADMIN_ROLES)
  export(@ChurchId() churchId: string, @CurrentUser() user: { id: string; role: string }, @Body() dto: MemberExportDto) {
    return this.exportService.export(churchId, user.role, user.id, dto);
  }

  @Post('photo')
  @Roles(...MEMBER_WRITE_ROLES)
  @UseInterceptors(FileInterceptor('photo', imageUploadOptions()))
  async uploadPhoto(@UploadedFile() file: any, @Req() req: any) {
    if (!file) throw new BadRequestException('No file provided');
    return { url: await saveImage(req, 'members', file) };
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'scope', required: false, description: "'all' = whole organisation (Senior Pastor only)" })
  async findAll(
    @ChurchId() churchId: string,
    @CurrentUser() user: { role: string },
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('scope') scope?: string,
    @Query('youth') youth?: string,
  ) {
    const s = await this.membersService.resolveScope(churchId, user.role, scope === 'all');
    return this.membersService.findAll(s, search, status, limit ? parseInt(limit, 10) : undefined, youth === 'true');
  }

  @Get('youth/summary')
  @Roles(...STAFF_ROLES)
  @ApiQuery({ name: 'scope', required: false })
  async youthSummary(
    @ChurchId() churchId: string,
    @CurrentUser() user: { role: string },
    @Query('scope') scope?: string,
  ) {
    const s = await this.membersService.resolveScope(churchId, user.role, scope === 'all');
    return this.membersService.youthSummary(s);
  }

  /** Mark / unmark many existing members as youth at once. */
  @Post('youth/bulk')
  @Roles(...MEMBER_WRITE_ROLES)
  async youthBulk(
    @ChurchId() churchId: string,
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: YouthBulkDto,
  ) {
    const s = await this.membersService.resolveScope(churchId, user.role, true);
    return this.membersService.setYouthBulk(s, dto.memberIds, dto.isYouth, user.id);
  }

  @Get('count')
  @Roles(...STAFF_ROLES)
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'scope', required: false })
  async count(
    @ChurchId() churchId: string,
    @CurrentUser() user: { role: string },
    @Query('status') status?: string,
    @Query('scope') scope?: string,
    @Query('youth') youth?: string,
  ) {
    const s = await this.membersService.resolveScope(churchId, user.role, scope === 'all');
    return this.membersService.count(s, status, youth === 'true');
  }

  /**
   * One-time data fix: finds members whose churchRole is pastoral
   * but whose status was never synced to 'pastor'. Updates them all.
   * Safe to call multiple times.
   */
  @Post('sync-pastoral')
  @Roles(...SENIOR_ROLES)
  syncPastoral(@ChurchId() churchId: string) {
    return this.membersService.syncPastoralRecords(churchId);
  }

  /**
   * Finds members mis-tagged as 'pastor' via the general member form —
   * i.e. no pastoral churchRole, no pastoralPosition, not registered via
   * pastor_registration. Pass ?dryRun=false to apply the fix.
   */
  @Post('cleanup-mislabeled')
  @Roles(...SENIOR_ROLES)
  @ApiQuery({ name: 'dryRun', required: false })
  cleanupMislabeled(
    @ChurchId() churchId: string,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.membersService.cleanupMislabeled(churchId, dryRun !== 'false');
  }

  @Get(':id')
  @Roles(...STAFF_ROLES)
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @ChurchId() churchId: string,
    @CurrentUser() user: { role: string },
  ) {
    // A Senior Pastor may open any member of their organisation, e.g. one in a branch.
    const s = await this.membersService.resolveScope(churchId, user.role, true);
    return this.membersService.findByIdOrFail(id, s);
  }

  @Post()
  @Roles(...MEMBER_WRITE_ROLES)
  create(
    @ChurchId() churchId: string,
    @CurrentUser() user: { id: string },
    @Body() body: Record<string, unknown>,
  ) {
    return this.membersService.create(churchId, body, user.id);
  }

  @Patch(':id')
  @Roles(...MEMBER_WRITE_ROLES)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @ChurchId() churchId: string,
    @CurrentUser() user: { id: string; role: string },
    @Body() body: Record<string, unknown>,
  ) {
    const s = await this.membersService.resolveScope(churchId, user.role, true);
    return this.membersService.update(id, s, body, user.id);
  }

  /** Flag (or un-flag) an existing member for follow-up, e.g. someone who is backsliding. */
  @Post(':id/follow-up-flag')
  @Roles(...MEMBER_WRITE_ROLES)
  async setFollowUpFlag(
    @Param('id', ParseUUIDPipe) id: string,
    @ChurchId() churchId: string,
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: FollowUpFlagDto,
  ) {
    const s = await this.membersService.resolveScope(churchId, user.role, true);
    return this.membersService.setFollowUpFlag(id, s, dto.flag, dto.reason, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.SENIOR_PASTOR, UserRole.BRANCH_PASTOR)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @ChurchId() churchId: string,
    @CurrentUser() caller: { id: string; role: string },
  ) {
    const s = await this.membersService.resolveScope(churchId, caller.role, true);
    return this.membersService.softDelete(id, s, { userId: caller.id, role: caller.role });
  }
}
