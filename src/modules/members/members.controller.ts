import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile, Req, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { MembersService } from './members.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@/types';

@ApiTags('Members')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Post('photo')
  @UseInterceptors(FileInterceptor('photo', {
    storage: diskStorage({
      destination: (_req: any, _file: any, cb: any) => {
        const dir = join(process.cwd(), 'uploads', 'members');
        mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req: any, file: any, cb: any) => {
        const ext = (file.originalname.split('.').pop() ?? 'jpg').toLowerCase();
        cb(null, `${Date.now()}.${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
  }))
  async uploadPhoto(@UploadedFile() file: any, @Req() req: any) {
    if (!file) throw new BadRequestException('No file provided');
    const url = `${req.protocol}://${req.get('host')}/uploads/members/${file.filename}`;
    return { url };
  }

  @Get()
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @ChurchId() churchId: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.membersService.findAll(churchId, search, status, limit ? parseInt(limit, 10) : 100);
  }

  @Get('count')
  @ApiQuery({ name: 'status', required: false })
  count(@ChurchId() churchId: string, @Query('status') status?: string) {
    return this.membersService.count(churchId, status);
  }

  /**
   * One-time data fix: finds members whose churchRole is pastoral
   * but whose status was never synced to 'pastor'. Updates them all.
   * Safe to call multiple times.
   */
  @Post('sync-pastoral')
  syncPastoral(@ChurchId() churchId: string) {
    return this.membersService.syncPastoralRecords(churchId);
  }

  /**
   * Finds members mis-tagged as 'pastor' via the general member form —
   * i.e. no pastoral churchRole, no pastoralPosition, not registered via
   * pastor_registration. Pass ?dryRun=false to apply the fix.
   */
  @Post('cleanup-mislabeled')
  @ApiQuery({ name: 'dryRun', required: false })
  cleanupMislabeled(
    @ChurchId() churchId: string,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.membersService.cleanupMislabeled(churchId, dryRun !== 'false');
  }

  @Get(':id')
  findOne(@Param('id') id: string, @ChurchId() churchId: string) {
    return this.membersService.findByIdOrFail(id, churchId);
  }

  @Post()
  create(@ChurchId() churchId: string, @Body() body: Record<string, unknown>) {
    return this.membersService.create(churchId, body as any);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @ChurchId() churchId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.membersService.update(id, churchId, body as any);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(UserRole.SENIOR_PASTOR, UserRole.BRANCH_PASTOR)
  remove(
    @Param('id') id: string,
    @ChurchId() churchId: string,
    @CurrentUser() caller: { id: string; role: string },
  ) {
    return this.membersService.softDelete(id, churchId, { userId: caller.id, role: caller.role });
  }
}
