import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards, BadRequestException, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ChurchesService } from './churches.service';
import { CreateChurchDto } from './dto/create-church.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChurchId } from '../../common/decorators/church-id.decorator';

@ApiTags('Churches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('churches')
export class ChurchesController {
  constructor(private readonly churchesService: ChurchesService) {}

  @Post()
  createChurch(@CurrentUser() user: { id: string }, @Body() dto: CreateChurchDto) {
    return this.churchesService.createForUser(user.id, dto);
  }

  @Get('me')
  getMyChurch(@ChurchId() churchId: string) {
    return this.churchesService.findByIdOrFail(churchId);
  }

  @Patch('me')
  updateMyChurch(
    @ChurchId() churchId: string,
    @Body() body: Partial<{ name: string; address: string; city: string; phone: string; email: string; website: string }>,
  ) {
    return this.churchesService.update(churchId, body);
  }

  // ── Branches ────────────────────────────────────────────────────────────────

  @Get('branches')
  listBranches(@CurrentUser() user: { churchId: string | null }) {
    if (!user.churchId) throw new BadRequestException('No church associated with this account.');
    return this.churchesService.listBranchesWithStats(user.churchId);
  }

  @Post('branch')
  createBranch(
    @CurrentUser() user: { churchId: string | null },
    @Body() body: { name: string; address?: string; city?: string; phone?: string },
  ) {
    if (!user.churchId) throw new BadRequestException('Complete church setup before adding branches.');
    if (!body.name?.trim()) throw new BadRequestException('Branch name is required.');
    return this.churchesService.createBranch(user.churchId, body);
  }

  @Patch('branch/:id')
  updateBranch(
    @Param('id') id: string,
    @CurrentUser() user: { churchId: string | null },
    @Body() body: Partial<{ name: string; address: string; city: string; phone: string }>,
  ) {
    if (!user.churchId) throw new BadRequestException('No church associated with this account.');
    return this.churchesService.updateBranch(id, user.churchId, body);
  }

  @Delete('branch/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteBranch(@Param('id') id: string, @CurrentUser() user: { churchId: string | null }) {
    if (!user.churchId) throw new BadRequestException('No church associated with this account.');
    return this.churchesService.deleteBranch(id, user.churchId);
  }

  // ── Pastors ─────────────────────────────────────────────────────────────────

  @Get('pastors')
  getBranchPastors(@CurrentUser() user: { churchId: string | null }) {
    if (!user.churchId) throw new BadRequestException('No church associated with this account.');
    return this.churchesService.getBranchPastors(user.churchId);
  }

  @Patch('pastors/:pastorId/assign')
  assignPastor(
    @Param('pastorId') pastorId: string,
    @CurrentUser() user: { churchId: string | null },
    @Body() body: { branchId: string },
  ) {
    if (!user.churchId) throw new BadRequestException('No church associated with this account.');
    if (!body.branchId) throw new BadRequestException('branchId is required.');
    return this.churchesService.assignPastorToBranch(user.churchId, pastorId, body.branchId);
  }

  /**
   * Promotes a Member (registered via member form) to a Branch Pastor User account.
   * This creates/updates a User entity so the pastor can log in via phone OTP.
   */
  @Post('pastors/promote-member')
  promoteMemberToBranchPastor(
    @CurrentUser() user: { churchId: string | null },
    @Body() body: { memberId: string; branchId: string },
  ) {
    if (!user.churchId) throw new BadRequestException('No church associated with this account.');
    if (!body.memberId) throw new BadRequestException('memberId is required.');
    if (!body.branchId) throw new BadRequestException('branchId is required.');
    return this.churchesService.promoteMemberToBranchPastor(user.churchId, body.memberId, body.branchId);
  }
}
