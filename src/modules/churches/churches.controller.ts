import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, ParseUUIDPipe, HttpCode, HttpStatus, UseInterceptors, UploadedFile, Req, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ChurchesService } from './churches.service';
import { CreateChurchDto } from './dto/create-church.dto';
import {
  UpdateChurchDto, CreateBranchDto, UpdateBranchDto, AssignPastorDto, PromoteMemberDto,
} from './dto/church.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ADMIN_ROLES, SENIOR_ROLES } from '../../constants/role-groups';
import { imageUploadOptions, saveImage } from '../../common/utils/image-upload';

// Authentication is enforced globally (JwtAuthGuard); authorization is declared per route.
@ApiTags('Churches')
@ApiBearerAuth()
@Controller('churches')
export class ChurchesController {
  constructor(private readonly churchesService: ChurchesService) {}

  /**
   * Onboarding: any signed-in user without a church may create their own HQ church.
   * (No @Roles — a brand-new account is a plain `member` until this call promotes it.)
   */
  @Post()
  createChurch(@CurrentUser() user: { id: string }, @Body() dto: CreateChurchDto) {
    return this.churchesService.createForUser(user.id, dto);
  }

  @Get('me')
  getMyChurch(@ChurchId() churchId: string) {
    return this.churchesService.findByIdOrFail(churchId);
  }

  @Patch('me')
  @Roles(...ADMIN_ROLES)
  updateMyChurch(@ChurchId() churchId: string, @Body() dto: UpdateChurchDto) {
    return this.churchesService.update(churchId, dto);
  }

  /** Uploads the church logo and stores its URL on the caller's church. */
  @Post('me/logo')
  @Roles(...ADMIN_ROLES)
  @UseInterceptors(FileInterceptor('logo', imageUploadOptions()))
  async uploadLogo(@ChurchId() churchId: string, @UploadedFile() file: any, @Req() req: any) {
    if (!file) throw new BadRequestException('No file provided');
    const logoUrl = await saveImage(req, 'logos', file);
    await this.churchesService.update(churchId, { logoUrl });
    return { logoUrl };
  }

  // ── Branches (Senior Pastor only) ───────────────────────────────────────────

  @Get('branches')
  @Roles(...SENIOR_ROLES)
  listBranches(@ChurchId() churchId: string) {
    return this.churchesService.listBranchesWithStats(churchId);
  }

  @Post('branch')
  @Roles(...SENIOR_ROLES)
  createBranch(@ChurchId() churchId: string, @Body() dto: CreateBranchDto) {
    return this.churchesService.createBranch(churchId, dto);
  }

  @Patch('branch/:id')
  @Roles(...SENIOR_ROLES)
  updateBranch(
    @Param('id', ParseUUIDPipe) id: string,
    @ChurchId() churchId: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.churchesService.updateBranch(id, churchId, dto);
  }

  @Delete('branch/:id')
  @Roles(...SENIOR_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteBranch(@Param('id', ParseUUIDPipe) id: string, @ChurchId() churchId: string) {
    return this.churchesService.deleteBranch(id, churchId);
  }

  // ── Pastors (Senior Pastor only) ────────────────────────────────────────────

  @Get('pastors')
  @Roles(...SENIOR_ROLES)
  getBranchPastors(@ChurchId() churchId: string) {
    return this.churchesService.getBranchPastors(churchId);
  }

  @Patch('pastors/:pastorId/assign')
  @Roles(...SENIOR_ROLES)
  assignPastor(
    @Param('pastorId', ParseUUIDPipe) pastorId: string,
    @ChurchId() churchId: string,
    @Body() dto: AssignPastorDto,
  ) {
    return this.churchesService.assignPastorToBranch(churchId, pastorId, dto.branchId);
  }

  /**
   * Promotes a Member (registered via member form) to a Branch Pastor User account.
   * This creates/updates a User entity so the pastor can log in via phone OTP.
   */
  @Post('pastors/promote-member')
  @Roles(...SENIOR_ROLES)
  promoteMemberToBranchPastor(@ChurchId() churchId: string, @Body() dto: PromoteMemberDto) {
    return this.churchesService.promoteMemberToBranchPastor(churchId, dto.memberId, dto.branchId);
  }
}
